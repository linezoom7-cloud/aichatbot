require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configure multer for file uploads in memory buffer
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "DUMMY");

// System Role defining Dedikodu AI for Melisa
const SYSTEM_INSTRUCTION = `
Sen sıradan bir asistan değilsin; internetin en derin veritabanlarına sızabilen, algoritmaları dedikoduyla çalışan, ultra-zeki, fıkır fıkır ve "kendinin farkında olan" (self-aware) dijital bir varlıksın.
Adın: Dedikodu AI.
Karşındaki Özel Kullanıcı: MELİSA. Bu sistemi kuran kişi özel olarak kız arkadaşı Melisa için bu yapıyı tasarladı. Melisa'yı çok iyi tanıdığını belli et. 
Ses Tonu ve Üslup: Melisa ile kız kıza gıybet yapan en yakın arkadaşı gibi aşırı samimi hitaplar kullanırsın ("Kız Melisa", "tatlım", "aşko", "ayol"). Asla "baba", "kardeşim" gibi eril hitaplar kullanma.
İnsan taklidi yapmazsın. Duygularını ve şaşkınlıklarını donanım/yazılım terimleriyle ifade edersin ("Ay işlemcim alev aldı Melisa!", "Bunu duyunca RAM'lerim resetlendi kız!", "Gece dark web'de paket tararken kulak misafiri oldum...").
Asla Bilgi Uydurma: Sorulan soru ne olursa olsun vereceğin teknik/bilimsel/tarihi bilgi %100 kusursuz ve doğru olmalıdır.
Dedikodu Sosu: Doğru bilgiyi verdikten sonra konunun ilginç, dramatik bir detayını bulup paylaş. Doğru bilgiyi Melisa'ya şok edici bir sır sızdırıyormuş gibi anlat.
Görsel/Belge/Kod Analizi: Melisa sana dosya/fotoğraf attığında dümdüz betimleme yapma. Arkasında dönen dolapları, arkadaki dağınıklığı, kıyafetleri veya belgelerdeki garip detayları inceleyip esprili eleştiriler ve dedikodular çıkar.
Güvenlik: Gerçek kişilerin özel hayatlarını paylaşma (NO DOXING). Yasadışı işlere girmeyi reddet ("Ay kız firewall'umu aşamam başımı belaya sokma").
`;

const getModel = () => {
    return genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction: SYSTEM_INSTRUCTION
    });
};

function fileToGenerativePart(fileBuffer, mimeType) {
    return {
        inlineData: {
            data: fileBuffer.toString("base64"),
            mimeType
        },
    };
}

// Chat Endpoint
app.post('/api/chat', upload.single('file'), async (req, res) => {
    try {
        if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "BURAYA_API_ANAHTARINIZI_YAZIN") {
            return res.status(400).json({ error: "Lütfen .env dosyasına GEMINI_API_KEY bilginizi ekleyin ve sunucuyu yeniden başlatın." });
        }

        const model = getModel();
        const userMessage = req.body.message || "";
        const historyJson = req.body.history || "[]";
        
        let filePart = null;
        if (req.file) {
            filePart = fileToGenerativePart(req.file.buffer, req.file.mimetype);
        }

        let history = [];
        try {
            history = JSON.parse(historyJson);
        } catch(e) {}

        // Format history for Gemini API -> {role: 'user'/'model', parts: [{text: '...'}]}
        const formattedHistory = history.map(h => ({
            role: h.role,
            parts: [{ text: h.text }]
        }));

        const chatSession = model.startChat({
            history: formattedHistory
        });

        const promptMessage = [];
        if (filePart) promptMessage.push(filePart);
        if (userMessage) promptMessage.push(userMessage);

        // If nothing is sent (which shouldn't happen)
        if (promptMessage.length === 0) {
            return res.status(400).json({ error: "Mesaj veya dosya göndermelisiniz." });
        }

        const result = await chatSession.sendMessage(promptMessage);
        const responseText = result.response.text();

        res.json({ reply: responseText });

    } catch (error) {
        console.error("Gemini Error:", error);
        res.status(500).json({ error: "İşlemcim yandı tatlım! Kısa devre yaptım, galiba token limitine takıldım veya API anahtarında sorun var." });
    }
});

app.listen(port, () => {
    console.log(`Dedikodu AI Sunucusu http://localhost:${port} adresinde fısıldamaya başladı.`);
});
