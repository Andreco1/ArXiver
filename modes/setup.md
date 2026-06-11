# Setup Mode 

Goal: configure ArXiver for a specific researcher.

Inputs:
- config/profile.example.yml
- config/scoring.example.yml
- config/sources.example.yml 

Process:
1. Check whether config/profile.yml, config/scoring.yml, and config/sources.yml already exist.
2. If they do not exist, copy from the example files.
3. Ask the user targeted questions to fill missing profile values.
4. Always ask questions interactively (one at a time via the interactive question tool),
   never as a single prose block. Open-ended answers should still be collected interactively.
5. Keep defaults unless the user clearly wants to change them.
6. Explain every scoring weight change before applying it.
7. Never overwrite an existing config file without explicit approval.

Questions to ask:
- What is your field or research area?
- Which arXiv categories should ArXiver scan?
- What are your 3-5 active research interests?
- What open problems are you currently thinking about?
- Which methods, tools, datasets, or theory areas matter most?
- What kinds of papers do you want to avoid?
