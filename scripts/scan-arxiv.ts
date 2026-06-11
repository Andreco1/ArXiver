import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { XMLParser } from "fast-xml-parser";

type Paper = {
    id: string;
    title: string;
    authors: string[];
    abstract: string;
    categories: string[];
    primary_category: string;
    published_at: string;
    updated_at: string;
    arxiv_url: string;
    pdf_url: string;
    status: "new";
    created_at: string;
    updated_local_at: string;
};

const root = process.cwd();

function readYaml(file: string): any {
    return YAML.parse(fs.readFileSync(path.join(root, file), "utf8"));
}

function ensureDir(dir: string) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
}

function readExistingPapers(file: string): Map<string, any> {
    const fullPath = path.join(root, file);
    if (!fs.existsSync(fullPath)) return new Map();

    const rows = fs
        .readFileSync(fullPath, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));

    return new Map(rows.map((paper) => [paper.id, paper]));
}

function writeJsonl(file: string, rows: any[]) {
    fs.writeFileSync(
        path.join(root, file),
        rows.map((row) => JSON.stringify(row)).join("\n") + "\n"
    );
}

function normalizeText(value: string): string {
    return value.replace(/\s+/g, " ").trim();
}

function asArray<T>(value: T | T[] | undefined): T[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
}

function extractArxivId(guid: string): string {
    // guid format: oai:arXiv.org:2606.11192v1
    const match = guid.match(/oai:arXiv\.org:([^\s]+?)(?:v\d+)?$/i);
    if (match) return match[1];
    // fallback: strip https://arxiv.org/abs/
    return guid.replace(/^https?:\/\/arxiv\.org\/abs\//, "").replace(/v\d+$/, "");
}

function parseAbstract(description: string): string {
    // RSS descriptions are prefixed: "arXiv:ID Announce Type: new\nAbstract: ..."
    const match = description.match(/Abstract:\s*([\s\S]+)/i);
    return normalizeText(match ? match[1] : description);
}

function parseAuthors(creator: string | string[]): string[] {
    const raw = Array.isArray(creator) ? creator.join(", ") : creator;
    return raw
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean);
}

function parsePubDate(pubDate: string): string {
    try {
        return new Date(pubDate).toISOString();
    } catch {
        return new Date().toISOString();
    }
}

const HEADERS = {
    "User-Agent": "ArXiver/1.0 (personal research tool; mailto:arxiver@localhost)",
};

async function fetchWithRetry(url: string): Promise<string> {
    for (let attempt = 1; attempt <= 5; attempt++) {
        const response = await fetch(url, { headers: HEADERS });
        if (response.ok) return response.text();
        if (attempt < 5 && (response.status === 429 || response.status >= 500)) {
            const delay = attempt * 4000;
            console.log(`  ${response.status} from ${url}, retrying in ${delay / 1000}s (${attempt}/5)...`);
            await new Promise((r) => setTimeout(r, delay));
        } else {
            throw new Error(`Request failed: ${response.status} ${response.statusText} — ${url}`);
        }
    }
    throw new Error(`Exhausted retries for ${url}`);
}

async function fetchCategoryFeed(category: string): Promise<Paper[]> {
    const url = `https://rss.arxiv.org/rss/${category}`;
    const xml = await fetchWithRetry(url);

    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "",
        isArray: (name) => name === "item" || name === "category",
    });

    const parsed = parser.parse(xml);
    const items: any[] = parsed?.rss?.channel?.item ?? [];
    const now = new Date().toISOString();
    const papers: Paper[] = [];

    for (const item of items) {
        const guid = item.guid?.["#text"] ?? item.guid ?? "";
        if (!guid) continue;

        const id = extractArxivId(String(guid));
        if (!id) continue;

        const announceType = item["arxiv:announce_type"] ?? "new";
        if (announceType === "replace") continue; // skip updates to existing papers

        const rawCategories = asArray(item.category).map((c: any) =>
            typeof c === "string" ? c : String(c)
        );

        const pubDate = parsePubDate(item.pubDate ?? "");

        papers.push({
            id,
            title: normalizeText(item.title ?? ""),
            authors: parseAuthors(item["dc:creator"] ?? ""),
            abstract: parseAbstract(item.description ?? ""),
            categories: rawCategories.length ? rawCategories : [category],
            primary_category: category,
            published_at: pubDate,
            updated_at: pubDate,
            arxiv_url: `https://arxiv.org/abs/${id}`,
            pdf_url: `https://arxiv.org/pdf/${id}`,
            status: "new",
            created_at: now,
            updated_local_at: now,
        });
    }

    return papers;
}

async function main() {
    const sources = readYaml("config/sources.yml");
    const categories: string[] = sources.arxiv.categories;

    console.log(`Scanning arXiv RSS feeds: ${categories.join(", ")}`);

    const existing = readExistingPapers("data/papers.jsonl");
    const seen = new Set<string>(existing.keys());
    let added = 0;

    for (const category of categories) {
        process.stdout.write(`  Fetching ${category}... `);
        const papers = await fetchCategoryFeed(category);
        let catAdded = 0;

        for (const paper of papers) {
            if (seen.has(paper.id)) continue;
            seen.add(paper.id);
            existing.set(paper.id, paper);
            catAdded++;
            added++;
        }

        console.log(`${catAdded} new papers (${papers.length} in feed)`);

        // arXiv RSS rate limit courtesy delay
        if (categories.indexOf(category) < categories.length - 1) {
            await new Promise((r) => setTimeout(r, 1000));
        }
    }

    ensureDir("data");
    const rows = Array.from(existing.values()).sort((a, b) =>
        b.published_at.localeCompare(a.published_at)
    );

    writeJsonl("data/papers.jsonl", rows);
    console.log(`\nScan complete. Added ${added} new papers. Total: ${rows.length}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
