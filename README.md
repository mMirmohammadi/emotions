# Emotion Mind Map

> An interactive visualization of 260+ human emotions as a hierarchical mind map, helping you explore, understand, and reflect on the full spectrum of emotional experience.

**[Try it live](https://mmirmohammadi.github.io/emotions/)**

## Overview

Emotion Mind Map renders a navigable network graph of emotions organized into categories (e.g., Sad, Angry, Excited, Loving) with increasingly specific emotional states at each level. Click any node to read its description, mark whether you relate to it, and attach personal notes.

### Key Features

- **Interactive network graph** powered by [vis.js](https://visjs.github.io/vis-network/docs/network/) with zoom, pan, and click-to-explore
- **Guided tour** that walks you through the emotion tree step by step
- **Bilingual support** -- switch between English and Persian (فارسی)
- **Personal reflection** -- mark emotions you connect with and add private notes
- **Save / Download / Upload** your personal emotion data as JSON for portability
- **Responsive design** that works on both desktop and mobile

## How to Use

1. Open the [live site](https://mmirmohammadi.github.io/emotions/)
2. Click any emotion node to see its description in the side panel
3. Use **Start Guided Tour** for a structured walkthrough
4. Toggle **Show My Emotions** to filter the map to emotions you've marked
5. Switch to **فارسی** for the Persian version of the emotion tree
6. **Save** your progress to local storage or **Download** it as a JSON file

## Tech Stack

- HTML / CSS / JavaScript (vanilla, no build step)
- [vis-network](https://visjs.github.io/vis-network/) for graph rendering
- Font Awesome for icons
- GitHub Pages for hosting

## Data

The emotion taxonomy contains **260 emotions** organized in a three-level hierarchy covering both positive and negative emotional states. Each emotion includes a written description explaining its nuance. The full dataset is stored in `emotions.json` (English) and `emotions_persian.json` (Persian).

## Running Locally

```bash
git clone https://github.com/mMirmohammadi/emotions.git
cd emotions
# Open index.html in your browser, or use any static server:
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## License

This project is open source. Feel free to fork, adapt, or contribute.
