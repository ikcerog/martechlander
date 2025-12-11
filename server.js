// server.js
// This file runs your secure backend server.

const express = require('express');
const path = require('path');
// Import dotenv to load environment variables from the .env file
require('dotenv').config(); 
// Import the Google GenAI SDK
const { GoogleGenAI } = require('@google/genai');

const app = express();
const port = 3000;

// --- API KEY INITIALIZATION ---
// The Gemini client securely reads the GEMINI_API_KEY from process.env
// The dotenv package made this key available from your .env file.
const ai = new GoogleGenAI(process.env.GEMINI_API_KEY);

// --- MIDDLEWARE SETUP ---
// 1. Serve static files (your index.html, CSS, JS) from the current directory
app.use(express.static(path.join(__dirname, '.')));
// 2. Middleware to parse incoming JSON bodies (to read htmlContent from the frontend)
app.use(express.json()); 

// --- SECURE AI PROXY ENDPOINT ---
// This endpoint receives the dashboard's HTML content from the browser
// and securely forwards it to the Gemini API.
app.post('/api/summarize-news', async (req, res) => {
    
    // Check if the API key was loaded (for debugging)
    if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ 
            error: "Server configuration error: GEMINI_API_KEY is not set in the .env file." 
        });
    }

    try {
        // Extract the HTML content sent from the frontend
        const { htmlContent } = req.body;
        
        if (!htmlContent) {
            return res.status(400).send({ error: "Missing HTML content in the request body." });
        }

        // The carefully crafted prompt, instructing the AI on how to analyze the HTML
        const prompt = `
            Analyze the following HTML source code from a personalized news dashboard.
            The news data is inside elements with class 'news-card', focusing on the <h4> (Headline)
            and the source span (e.g., Source: [Name]).

            Your role is a Senior Digital Strategy Analyst. Ignore all JavaScript, CSS, and structural HTML.

            Provide the required analysis in the exact two sections below:

            A. Executive Summary: Core Market Themes
            Provide a concise, three-sentence paragraph summarizing the overarching themes:
            - Sentence 1: Identify the main technological or regulatory driver.
            - Sentence 2: Describe the resulting major business challenge or opportunity.
            - Sentence 3: Provide a clear strategic outlook or prediction for the next 6 months.

            B. Strategic Recommendations for Next Week
            Provide two distinct strategic recommendations for an e-commerce brand's marketing leadership.
            1. Recommendation 1 (Urgent Focus): 
               - Actionable Advice: The critical, time-sensitive action the brand must take next week.
               - Evidence: Cite the exact Headline and Source from one specific news card that supports this focus.
            2. Recommendation 2 (Long-Term Focus):
               - Actionable Advice: The foundational preparation or long-term investment the brand should initiate.
               - Evidence: Cite the exact Headline and Source from one specific news card that supports this investment.
            
            ---
            HTML to analyze:
            ${htmlContent}
        `;

        // Securely call the Gemini API
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [prompt],
            // Optional: Adjust temperature for more creative/less creative summaries
            // config: { temperature: 0.2 }, 
        });

        // Send the AI's clean text response back to the browser
        res.json({ summary: response.text });

    } catch (error) {
        console.error("Critical Gemini API or Server Error:", error);
        // Send a generic error message to the client, but log the detail on the server
        res.status(500).json({ error: "Failed to generate AI summary. Check the server console for the technical error." });
    }
});

// --- START THE SERVER ---
app.listen(port, () => {
    console.log(`\n🎉 Dashboard server running securely at http://localhost:${port}`);
    console.log('Ensure you have run "npm install express @google/genai dotenv" first.');
    console.log('The Gemini API key is securely loaded from your .env file.');
});