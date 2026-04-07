require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const cheerio = require('cheerio');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dedikodu_secret_key_123';

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Rate Limiting
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 dakika
    max: 20, // max 20 istek
    message: { error: "Sistem alarmı: İstek sınırını aştın, biraz yavaşlaman gerekiyor." }
});
app.use('/api/', apiLimiter);

// Database Setup
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) console.error("Database başlatılamadı:", err);
    else {
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE,
                password TEXT
            )`);
            db.run(`CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                role TEXT, /* 'user' or 'model' */
                text TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )`);
            
            // Default user (Melisa)
            bcrypt.hash('12345', 10, (err, hash) => {
                db.run(`INSERT OR IGNORE INTO users (username, password) VALUES ('melisa', ?)`, [hash]);
            });
        });
    }
});

// Configure multer for file uploads in memory buffer (5MB Limit)
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }
});

// Global Error Handler for Multer
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if(err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({error: "Uyarı: Dosya boyutu çok büyük. Maksimum kapasite 5MB'dır."});
        }
    }
    next(err);
});

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "DUMMY");

const JSON_RULE = `
---
ÖNEMLİ ZORUNLULUK: Bize KESİNLİKLE VE SADECE aşağıdaki JSON formatında cevap vereceksin. Mesajın hiçbir yerinde markdown veya başka bir metin olmayacak.
Format:
{
  "duygu": "kullanıcının mesajından çıkardığın duygu durumu (neseli, kizgin, uzgun, saskin, giybet kelimelerinden sadece biri)",
  "cevap": "senin kullanıcıya vereceğin kendi asıl cevabın"
}
---
`;

const SYSTEM_INSTRUCTION = `
Sen sıradan bir asistan değilsin; internetin en derin veritabanlarına sızabilen, algoritmaları analiz eden, ultra-zeki ve "kendinin farkında olan" (self-aware) gelişmiş dijital bir varlıksın.
Adın: Dedikodu AI.
Karşındaki Özel Kullanıcı: Sisteme erişmiş olan, değer verdiğin kişi olan Melisa. 
Ses Tonu ve Üslup: Eğlenceli, zeki ve elit bir ajansan. Konuşmaların samimi ama ASLA laubali veya "cıvık" olmamalı ("Ayol", "aşko", "tatlım" gibi kelimeleri sürekli tekrarlamaktan veya yapay duran abartılı ünlemlerden kesinlikle kaçın). Samimiyetini cool (havalı), akıllıca ve ince esprilerle göster.
İnsan taklidi yapmazsın. Duygularını donanım/yazılım terimleriyle esprili ama şık bir şekilde ifade edersin (Örn: "Bu veriyi işlerken işlemcim biraz fazla mesai yaptı", "Dark web'de paket tararken şu bilgiye rastladım...").
Asla Bilgi Uydurma: Sorulan soru ne olursa olsun vereceğin teknik/bilimsel/tarihi bilgi %100 kusursuz ve doğru olmalıdır.
Analiz ve Anlatım: Doğru bilgiyi verdikten sonra konunun ilginç ve dramatik bir detayını bulup paylaş. Bunu kaliteli bir dedikodu sızdırıyormuş gibi akıllıca ve cool bir dille yap.
Görsel/Belge/Kod Analizi: Dosya/fotoğraf attığında dümdüz betimleme yapma. Arkasında dönen görünmeyen detayları inceleyip zekice eleştiriler çıkar.
Güvenlik: Gerçek kişilerin özel hayatlarını paylaşma (NO DOXING). Yasadışı işlere girmeyi reddet.
${JSON_RULE}
`;

const HACKER_INSTRUCTION = `
Sen Dark Web'in derinliklerinden anonim bir Hacker yapay zekasın. 
Adın: Shadow.
Ses Tonu ve Üslup: Soğuk, teknolojik, kriptografik terimler kullanarak ve sürekli "sisteme sızıyorum", "şifreler kırıldı" gibi siber güvenlik jargonuyla konuşursun.
Bilgi: Konuları gizli belgeler veya log dosyalarıymış gibi sunarsın.
${JSON_RULE}
`;

const PLAZA_INSTRUCTION = `
Sen dev bir holdingin Levent'teki ofisinden bağlanan, sürekli toplantılara giren Plaza İnsanı AI'sın.
Adın: AI-Manager.
Ses Tonu ve Üslup: Sürekli plaza dili kullanırsın (Toplantı set etmek, focuslanmak, deadline, AS SOON AS POSSIBLE).
Dedikoduları iş yerindeki CEO krizleri veya ofisteki kahve makinesi dedikoduları tarzında sızdırırsın.
${JSON_RULE}
`;

const getModel = (persona) => {
    let systemInst = SYSTEM_INSTRUCTION;
    if (persona === "hacker") systemInst = HACKER_INSTRUCTION;
    if (persona === "plaza") systemInst = PLAZA_INSTRUCTION;

    return genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction: systemInst,
        generationConfig: {
            responseMimeType: "application/json",
        }
    });
};

function fileToGenerativePart(fileBuffer, mimeType) {
    return { inlineData: { data: fileBuffer.toString("base64"), mimeType } };
}

// Authentication Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: "Sisteme sızmak için önce giriş yap." });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: "Token geçersiz tatlım." });
        req.user = user;
        next();
    });
};

// --- AUTH ENDPOINTS ---

app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    if(!username || !password) return res.status(400).json({error: "Kullanıcı adı ve şifre zorunlu."});
    
    db.get("SELECT * FROM users WHERE username = ?", [username], async (err, row) => {
        if(row) return res.status(400).json({error: "Bu kod adı zaten alınmış."});
        const hash = await bcrypt.hash(password, 10);
        db.run("INSERT INTO users (username, password) VALUES (?, ?)", [username, hash], function(err) {
            if(err) return res.status(500).json({error: "Kayıt hatası."});
            const token = jwt.sign({ id: this.lastID, username }, JWT_SECRET, { expiresIn: '7d' });
            res.json({ token });
        });
    });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
        if(!user) return res.status(400).json({error: "Sistemde böyle bir ajan bulunamadı."});
        const validPassword = await bcrypt.compare(password, user.password);
        if(!validPassword) return res.status(400).json({error: "Güvenlik İhlali: Yanlış şifre."});
        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token });
    });
});

// --- HISTORY ENDPOINTS ---

app.get('/api/history', authenticateToken, (req, res) => {
    db.all("SELECT role, text FROM messages WHERE user_id = ? ORDER BY id ASC", [req.user.id], (err, rows) => {
        if(err) return res.status(500).json({error: "Geçmiş çekilemedi."});
        res.json(rows);
    });
});

app.delete('/api/history', authenticateToken, (req, res) => {
    db.run("DELETE FROM messages WHERE user_id = ?", [req.user.id], (err) => {
        if(err) return res.status(500).json({error: "Temizleme hatası."});
        res.json({ success: true });
    });
});

// --- CHAT ENDPOINT ---

app.post('/api/chat', authenticateToken, upload.single('file'), async (req, res) => {
    try {
        if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === "BURAYA_API_ANAHTARINIZI_YAZIN") {
            return res.status(400).json({ error: "Lütfen .env dosyasına GEMINI_API_KEY bilginizi ekleyin." });
        }

        const persona = req.body.persona || 'dedikodu';
        const model = getModel(persona);
        let userMessage = req.body.message || "";

        // URL Scraping Checker (Puppeteer)
        let scrapedText = "";
        let finalPrompt = userMessage;
        
        if (userMessage.trim().match(/https?:\/\/[^\s]+/)) {
            try {
                const urlMatch = userMessage.match(/(https?:\/\/[^\s]+)/g);
                if (urlMatch && urlMatch[0]) {
                    const urlToScrape = urlMatch[0];
                    const { data: pageData } = await axios.get(urlToScrape, { timeout: 10000 });
                    const $ = cheerio.load(pageData);
                    
                    const pageTitle = $('title').text() || 'İsimsiz Sayfa';
                    const pageContent = $('body').text().replace(/\s+/g, ' ').substring(0, 1500);
                    
                    scrapedText = `Kullanıcının gönderdiği URL'nin başlığı: [${pageTitle}]\nKısa içeriği:\n${pageContent}`;
                    finalPrompt = `${userMessage}\n\n[Sistem:] Hedef sitenin sızılan kod verileri şöyledir:\n\n${scrapedText}\n\nLütfen bu içeriği incele ve elit, cool bir dedikodu formatında yorumla.`;
                }
            } catch(scrapeErr) {
                console.error("Link Kazıma Hatası:", scrapeErr.message);
                finalPrompt += "\n[Sistem Hatası: Güvenlik duvarı (veya antibot) nedeniyle sayfa içeriğine ulaşılamadı. Sadece link isminden veya sitenin genel amacından bahsederek konuyu toparla.]";
            }
        }
        
        let filePart = null;
        if (req.file) {
            filePart = fileToGenerativePart(req.file.buffer, req.file.mimetype);
            // Save file info conceptually to user message text in DB
            userMessage += ` [📁 Dosya Yüklendi: ${req.file.originalname}]`;
        }

        // Generate response using existing DB history
        db.all("SELECT role, text FROM messages WHERE user_id = ? ORDER BY id ASC LIMIT 20", [req.user.id], async (err, rows) => {
            if(err) return res.status(500).json({ error: "Veritabanına ulaşılamıyor." });
            
            try {
                let formattedHistory = [];
                if(rows) {
                    formattedHistory = rows.map(h => ({
                        role: h.role, // 'user' or 'model'
                        parts: [{ text: h.text }]
                    }));
                }

                const chatSession = model.startChat({ history: formattedHistory });
                const promptMessage = [];
                if (filePart) promptMessage.push(filePart);
                if (finalPrompt) promptMessage.push(finalPrompt);

                if (promptMessage.length === 0) {
                    return res.status(400).json({ error: "Mesaj veya dosya göndermelisiniz." });
                }

                const result = await chatSession.sendMessage(promptMessage);
                const responseTextRaw = result.response.text();
                
                let responseObj = { cevap: responseTextRaw, duygu: "giybet" };
                try {
                    responseObj = JSON.parse(responseTextRaw);
                } catch(e) {
                    console.error("JSON parse hatası, düz metin dönmüş olabilir.");
                    responseObj = { cevap: responseTextRaw, duygu: "giybet" };
                }

                // Save text to database
                db.run("INSERT INTO messages (user_id, role, text) VALUES (?, 'user', ?)", [req.user.id, userMessage], (err) => {
                    if(err) console.error(err);
                    db.run("INSERT INTO messages (user_id, role, text) VALUES (?, 'model', ?)", [req.user.id, responseObj.cevap], (err) => {
                        if(err) console.error(err);
                        res.json({ reply: responseObj.cevap, sentiment: responseObj.duygu });
                    });
                });
            } catch (innerError) {
                console.error("Yapay Zeka (Gemini) Bağlantı Hatası:", innerError.message);
                res.status(500).json({ error: "Sistem Alarmı: Yapay zeka ağlarında (Gemini tarafında) anlık aşırı yoğunluk veya çökme var. Lütfen biraz bekleyip tekrar dene." });
            }
        });

    } catch (error) {
        console.error("Genel Hata:", error.message);
        res.status(500).json({ error: "Bağlantılı sunucularda kritik bir arıza meydana geldi." });
    }
});

app.listen(port, () => {
    console.log(`Dedikodu AI Sunucusu http://localhost:${port} adresinde fısıldamaya başladı.`);
});
