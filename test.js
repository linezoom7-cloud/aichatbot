require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
async function run() {
    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "DUMMY");
        const model = genAI.getGenerativeModel({
            model: 'gemini-1.5-flash',
            systemInstruction: "test"
        });
        const chatSession = model.startChat({
            history: []
        });
        const result = await chatSession.sendMessage(["selam"]);
        console.log("Success:", result.response.text());
    } catch(e) {
        console.error("Test Error Details:", e);
    }
}
run();
