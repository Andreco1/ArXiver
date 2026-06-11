# ArXiver 

ArXiver is a local, human-in-the-loop literature triage system for arXiv.

The system helps researchers:
- scan arXiv categories they care about
- evaluate papers against their research profile
- rank papers using weighted dimensions
- generate daily digests
- summarize key claims, methods, results, and equations
- maintain a manually curated reading queue

## Human-in-the-loop rule 

ArXiver recommends, but the researcher decides.

Never automatically:
- delete a paper
- archive a paper
- dismiss a paper
- mark a paper as read 
- modify the research profile without approval

## Data rule 

Use local files as the source of truth.

Prefer:
- config/*.yml for user configuration
- data/*.jsonl or data/*.sqlite for tracking
- reports/*.md for evaluations
- digests/*.md for daily digests 
