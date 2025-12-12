// server.js (New Version with Cheerio and Caching)

const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { GoogleGenAI } = require("@google/genai");
const cheerio = require('cheerio'); // <-- NEW: Cheerio for parsing
const fs = require('fs/promises'); // <-- NEW: File System for caching
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// --- API and Caching Configuration ---
const apiKey = process.env.GOOGLE_API_KEY; // Use the corrected name for Render
const ai = new GoogleGenAI({ apiKey: apiKey });

const CACHE_FILE = path.join(__dirname, 'ai_summary_cache.json');
const CACHE_TTL_HOURS = 4; // Cache will be valid for 4 hours

// Middleware setup
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Helper to load cache
async function getCachedSummary() {
    try {
        const data = await fs.readFile(CACHE_FILE, 'utf8');
        const cache = JSON.parse(data);
        const now = new Date();
        const expirationTime = new Date(cache.timestamp);
        expirationTime.setHours(expirationTime.getHours() + CACHE_TTL_HOURS);

        if (now < expirationTime) {
            return cache; // Cache is still valid
        }
    } catch (e) {
        // File doesn't exist or is invalid, proceed to generate
    }
    return null;
}

// Helper to save cache
async function saveCachedSummary(summary) {
    const cache = {
        summary: summary,
        timestamp: new Date().toISOString(),
        ttl: CACHE_TTL_HOURS
    };
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache), 'utf8');
    return cache;
}

// --- Pre-processing Function (The Speed Fix) ---
function extractCleanNewsData(htmlContent) {
    const $ = cheerio.load(htmlContent);
    const articles = [];

    // Assuming the news items are still wrapped in a .news-card class
    $('.news-card').each((i, el) => {
        const titleElement = $(el).find('h3 a');
        const title = titleElement.text().trim();
        const url = titleElement.attr('href') || '#';
        const summary = $(el).find('.summary').text().trim();

        if (title && summary) {
            articles.push({ title, summary, url });
        }
    });

    // Format the clean data for the LLM to process
    return articles.map((art, index) =>
        `[ARTICLE ${index + 1}]
        Title: ${art.title}
        URL: ${art.url}
        Summary: ${art.summary.substring(0, 300)} // Truncate summary to save tokens
        ---`
    ).join('\n');
}

// 2. AI Summary Endpoint
app.post('/api/summarize-news', async (req, res) => {
    const htmlContent = req.body.htmlContent;

    // 1. CHECK CACHE
    const cachedData = await getCachedSummary();
    if (cachedData) {
        return res.json({ 
            summary: cachedData.summary, 
            timestamp: cachedData.timestamp,
            isCached: true
        });
    }

    // 2. PRE-PROCESS (If cache miss)
    const cleanNewsData = extractCleanNewsData(htmlContent);
    if (!cleanNewsData) {
        return res.status(400).json({ error: 'No clean news content found to summarize.' });
    }

    // 3. GENERATE PROMPT (Using the clean data)
    const modelName = "gemini-2.5-flash"; 
    const inputPrompt = `
        You are a senior strategic analyst specializing in AdTech, Marketing, and Enterprise Technology.
        Your task is to analyze the following CLEAN news articles. The data is pre-parsed; only focus on the content.

        1. **ANALYZE** the ${cleanNewsData.split('\n---').length} articles provided below.
        2. **GENERATE** a strategic summary in Markdown format.
        3. **CRITICAL**: For every key trend and takeaway, cite the story by title and include the URL in parentheses at the end of the citation.

        Your output MUST be structured using Markdown headings and lists, focusing on actionable insights:

        ## 📰 Core Trends & Market Focus
        * **[Trend 1/Topic]**: Describe theme. (Source: [Title](URL))
        * **[Trend 2/Topic]**: Describe theme. (Source: [Title](URL))
        * ... (List 3-5 major recurring themes)

        ## 💡 Strategic Takeaways for AdTech Leadership
        * **For Branding & Campaigns**: Actionable step. (Source: [Title](URL))
        * **For Ad Technology**: Actionable step. (Source: [Title](URL))
        * **For Enterprise Tech/FinTech**: Actionable step. (Source: [Title](URL))

        ## 📉 Potential Risks & Blindspots
        * [Risk 1]: A critical risk emerging from the news. (Source: [Title](URL))

        ---
        CLEAN News Data to Analyze:
        ---
        ${cleanNewsData}
    `;
    
    try {
        const response = await ai.models.generateContent({
            model: modelName,
            contents: inputPrompt,
            // Add a token limit to ensure faster generation (e.g., 1000 tokens)
            config: {
                maxOutputTokens: 1000 
            }
        });

        const summary = response.text;
        const cacheResult = await saveCachedSummary(summary); // 4. CACHE RESULT

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
