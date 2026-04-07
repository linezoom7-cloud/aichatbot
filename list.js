require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
async function run() {
    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        // List models is not natively exposed easily without fetch, so I will fetch it
        const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + process.env.GEMINI_API_KEY);
        const data = await res.json();
        console.log(data.models.map(m => m.name).join('\\n'));
    } catch(e) {
        console.error(e);
    }
}
run();
