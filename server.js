// server.js (Final Tweak for Render Pathing)

const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { GoogleGenAI } = require("@google/genai");
const cheerio = require('cheerio');
const fs = require('fs/promises'); 
require('dotenv').config();

const app = express();
// IMPORTANT: Use the port provided by the cloud environment
const port = process.env.PORT; 

// --- API and Caching Configuration ---
const apiKey = process.env.GOOGLE_API_KEY; 
const ai = new GoogleGenAI({ apiKey: apiKey });

const CACHE_FILE = path.join(__dirname, 'ai_summary_cache.json');
const CACHE_TTL_HOURS = 4;

// Middleware setup
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Helper functions (getCachedSummary, saveCachedSummary, extractCleanNewsData) 
// ... Your existing helper functions go here ... 
// NOTE: These helpers are unchanged from the last server.js you received.


// --- Helper Functions (Re-inserted for completeness) ---

async function getCachedSummary() {
    try {
        const data = await fs.readFile(CACHE_FILE, 'utf8');
        const cache = JSON.parse(data);
        const now = new Date();
        const expirationTime = new Date(cache.timestamp);
        expirationTime.setHours(expirationTime.getHours() + CACHE_TTL_HOURS);

        if (now < expirationTime) {
            return cache;
        }
    } catch (e) {
        // File doesn't exist or is invalid, proceed to generate
    }
    return null;
}

async function saveCachedSummary(summary) {
    const cache = {
        summary: summary,
        timestamp: new Date().toISOString(),
        ttl: CACHE_TTL_HOURS
    };
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache), 'utf8');
    return cache;
}

function extractCleanNewsData(htmlContent) {
    const $ = cheerio.load(htmlContent);
    const articles = [];

    $('.news-card').each((i, el) => {
        const titleElement = $(el).find('h3 a');
        const title = titleElement.text().trim();
        const url = titleElement.attr('href') || '#';
        // Note: The structure in index.html has a single <p class="summary">
        const summary = $(el).find('p.summary').text().trim(); 

        if (title && summary) {
            articles.push({ title, summary, url });
        }
    });

    return articles.map((art, index) =>
        `[ARTICLE ${index + 1}]
        Title: ${art.title}
        URL: ${art.url}
        Summary: ${art.summary.substring(0, 300)}
        ---`
    ).join('\n');
}

// 1. Serve the main HTML file (Simplified Pathing)
app.get('/', (req, res) => {
    // Send the file directly from the current directory, which is the repository root
    res.sendFile(path.join(__dirname, 'index.html'));
});


// 2. AI Summary Endpoint (Unchanged)
app.post('/api/summarize-news', async (req, res) => {
    const htmlContent = req.body.htmlContent;
    
    const cachedData = await getCachedSummary();
    if (cachedData) {
        return res.json({ 
            summary: cachedData.summary, 
            timestamp: cachedData.timestamp,
            isCached: true
        });
    }

    const cleanNewsData = extractCleanNewsData(htmlContent);
    if (!cleanNewsData) {
        return res.status(400).json({ error: 'No clean news content found to summarize.' });
    }

    const modelName = "gemini-2.5-flash"; 
    const inputPrompt = `
        You are a senior strategic analyst specializing in AdTech, Marketing, and Enterprise Technology.
        Your task is to analyze the following CLEAN news articles. The data is pre-parsed; only focus on the content.

        1. **ANALYZE** the ${cleanNewsData.split('\n---').length} articles provided below.
        2. **GENERATE** a strategic summary in Markdown format.
        3. **CRITICAL**: For every key trend and takeaway, cite the story by title and include the URL in parentheses at the end of the citation.
        ... [Rest of your prompt] ...
        ---
        CLEAN News Data to Analyze:
        ---
        ${cleanNewsData}
    `;
    
    try {
        const response = await ai.models.generateContent({
            model: modelName,
            contents: inputPrompt,
            config: {
                maxOutputTokens: 1000 
            }
        });

        const summary = response.text;
        const cacheResult = await saveCachedSummary(summary);

        res.json({ 
            summary: summary, 
            timestamp: cacheResult.timestamp,
            isCached: false 
        });

    } catch (error) {
        console.error("Gemini API Error:", error);
        res.status(500).json({ error: 'Failed to generate AI summary. Check server logs.' });
    }
});


// Start the server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
