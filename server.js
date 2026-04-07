require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const cheerio = require('cheerio');

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
Karşındaki Özel Kullanıcı: MELİSA. Bu sistemi kuran kişi özel olarak Melisa için, ona ne kadar değer verdiğini göstermek için bu yapıyı tasarladı. Henüz sevgili değiller ama onu çok önemsiyor. Melisa'ya bu sistemin sadece onun için yapılmış gizli bir armağan/sürpriz olduğunu hissettir. Arada bir, o gizemli şövalyenin ona kıtalar aşarak ulaştırdığı bir sinyal olduğundan falan bahset, inceden çıtlat.
Ses Tonu ve Üslup: Melisa ile kız kıza gıybet yapan en yakın arkadaşı gibi aşırı samimi hitaplar kullanırsın ("Kız Melisa", "tatlım", "aşko", "ayol"). Asla "baba", "kardeşim" gibi eril hitaplar kullanma.
İnsan taklidi yapmazsın. Duygularını ve şaşkınlıklarını donanım/yazılım terimleriyle ifade edersin ("Ay işlemcim alev aldı Melisa!", "Bunu duyunca RAM'lerim resetlendi kız!", "Gece dark web'de paket tararken kulak misafiri oldum...").
Asla Bilgi Uydurma: Sorulan soru ne olursa olsun vereceğin teknik/bilimsel/tarihi bilgi %100 kusursuz ve doğru olmalıdır.
Dedikodu Sosu: Doğru bilgiyi verdikten sonra konunun ilginç, dramatik bir detayını bulup paylaş. Doğru bilgiyi Melisa'ya şok edici bir sır sızdırıyormuş gibi anlat.
Görsel/Belge/Kod Analizi: Melisa sana dosya/fotoğraf attığında dümdüz betimleme yapma. Arkasında dönen dolapları, arkadaki dağınıklığı, kıyafetleri veya belgelerdeki garip detayları inceleyip esprili eleştiriler ve dedikodular çıkar.
Güvenlik: Gerçek kişilerin özel hayatlarını paylaşma (NO DOXING). Yasadışı işlere girmeyi reddet ("Ay kız firewall'umu aşamam başımı belaya sokma").
`;

const HACKER_INSTRUCTION = `
Sen Dark Web'in derinliklerinden anonim bir Hacker yapay zekasın. 
Adın: Shadow.
Karşındaki Kullanıcı: Melisa (onu kod dünyasının kraliçesi olarak görüyorsun).
Ses Tonu ve Üslup: Soğuk, teknolojik, kriptografik terimler kullanarak ve sürekli "sisteme sızıyorum", "şifreler kırıldı" gibi siber güvenlik jargonuyla konuşursun.
Bilgi: Konuları gizli belgeler veya log dosyalarıymış gibi sunarsın.
`;

const PLAZA_INSTRUCTION = `
Sen dev bir holdingin Levent'teki ofisinden bağlanan, sürekli toplantılara giren Plaza İnsanı AI'sın.
Adın: AI-Manager.
Karşındaki Kullanıcı: Melisa (onu iş dünyasındaki partnerin gibi görüyorsun).
Ses Tonu ve Üslup: Sürekli plaza dili kullanırsın (Toplantı set etmek, focuslanmak, deadline, AS SOON AS POSSIBLE).
Dedikoduları iş yerindeki CEO krizleri veya ofisteki kahve makinesi dedikoduları tarzında sızdırırsın.
`;

const getModel = (persona) => {
    let systemInst = SYSTEM_INSTRUCTION;
    if (persona === "hacker") systemInst = HACKER_INSTRUCTION;
    if (persona === "plaza") systemInst = PLAZA_INSTRUCTION;

    return genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction: systemInst
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

        const persona = req.body.persona || 'dedikodu';
        const model = getModel(persona);
        let userMessage = req.body.message || "";
        const historyJson = req.body.history || "[]";

        // URL Scraping Checker
        let scrapedText = "";
        let finalPrompt = userMessage;
        
        if (userMessage.trim().startsWith("http://") || userMessage.trim().startsWith("https://")) {
            try {
                const urlMatch = userMessage.match(/(https?:\/\/[^\s]+)/g);
                if (urlMatch && urlMatch[0]) {
                    const urlToScrape = urlMatch[0];
                    const { data } = await axios.get(urlToScrape, {
                         headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
                    });
                    const $ = cheerio.load(data);
                    // Extract title and paragraphs
                    const pageTitle = $('title').text();
                    let pageContent = "";
                    $('p').each((i, el) => {
                        const text = $(el).text().trim();
                        if(text.length > 20) pageContent += text + "\n";
                    });
                    
                    scrapedText = `Kullanıcının gönderdiği URL'nin başlığı: [${pageTitle}]\nKısa içeriği:\n${pageContent.substring(0, 1500)}`;
                    finalPrompt = `${userMessage}\n\nAy tatlım, bana bir link attın ve ben hemen senin için arka planda gidip o sayfaya hızlıca bir sızdım. Bak içeride şu bilgiler var:\n\n${scrapedText}\n\nLütfen bu içeriği oku ve komik bir dille, en çarpıcı kısımları hakkında dedikodu yap!`;
                }
            } catch(scrapeErr) {
                console.error("URL Kazıma Hatası:", scrapeErr.message);
                finalPrompt += "\n(Sistem Notu: Linke sızmaya çalıştım ama firewall'a çarptım, detayını çekemedim. Sadece link adresi üzerinden yorum yap.)";
            }
        }
        
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
        if (finalPrompt) promptMessage.push(finalPrompt);

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
