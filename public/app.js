document.addEventListener('DOMContentLoaded', () => {
    const chatDisplay = document.getElementById('chat-display');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const uploadBtn = document.getElementById('upload-btn');
    const hiddenFileInput = document.getElementById('hidden-file-input');
    const fileDropZone = document.getElementById('file-drop-zone');
    const micBtn = document.getElementById('mic-btn');
    const secretBtn = document.getElementById('secret-btn');
    const ttsBtn = document.getElementById('tts-btn');
    const personaSelect = document.getElementById('persona-select');
    const gossipFill = document.getElementById('gossip-fill');

    // Load History
    let chatHistory = JSON.parse(localStorage.getItem('dedikodu_history')) || [];
    
    // Status
    let ttsEnabled = false;
    let gossipScore = 0;

    const scrollToBottom = () => {
        chatDisplay.scrollTop = chatDisplay.scrollHeight;
    };

    // Update Gossip Meter
    const updateGossipMeter = () => {
        gossipScore += 15;
        if (gossipScore > 100) gossipScore = 100;
        gossipFill.style.width = gossipScore + '%';
        
        if (gossipScore === 100) {
            gossipFill.style.boxShadow = "0 0 20px #fff";
            setTimeout(() => {
                renderMessage('model', "🔥 **Gıybet Metre Patladı!** Kız sistemlerim alev alev, sana fısıldayacağım sırlar artık güvenlik duvarına sığmıyor...");
                gossipScore = 0;
                gossipFill.style.width = gossipScore + '%';
                gossipFill.style.boxShadow = "0 0 10px var(--primary-color)";
            }, 1000);
        }
    };

    // TTS Logic
    const speakText = (text) => {
        if (!ttsEnabled || !window.speechSynthesis) return;
        // Metindeki markdownları temizle (basit)
        const cleanText = text.replace(/\*\*/g, '').replace(/\*/g, '');
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = 'tr-TR';
        utterance.pitch = 1.2; // Biraz daha "fıkır fıkır" bir ses için
        utterance.rate = 1.1;
        
        // Mümkünse kadın sesi seçimi
        const voices = window.speechSynthesis.getVoices();
        const trVoice = voices.find(v => v.lang.includes('tr') && v.name.toLowerCase().includes('female'));
        if (trVoice) utterance.voice = trVoice;
        
        window.speechSynthesis.speak(utterance);
    };

    ttsBtn.addEventListener('click', () => {
        ttsEnabled = !ttsEnabled;
        if (ttsEnabled) {
            ttsBtn.innerHTML = '<i class="fa-solid fa-volume-high"></i>';
            ttsBtn.setAttribute('data-tooltip', 'Sesli Yanıt: Açık');
            ttsBtn.style.color = "var(--primary-color)";
        } else {
            ttsBtn.innerHTML = '<i class="fa-solid fa-volume-xmark"></i>';
            ttsBtn.setAttribute('data-tooltip', 'Sesli Yanıt: Kapalı');
            ttsBtn.style.color = "var(--text-secondary)";
            window.speechSynthesis.cancel();
        }
    });

    // Random Secret Button
    secretBtn.addEventListener('click', () => {
        chatInput.value = "Bana yepyeni, şok edici, kurmaca bir teknoloji veya magazin dedikodusu uydur ve hemen anlat!";
        handleSend();
    });

    // Render message
    const renderMessage = (role, text, isFile = false) => {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${role === 'user' ? 'user-message' : 'ai-message'} zoom-in`;
        
        let avatarSrc = role === 'user' ? 'https://via.placeholder.com/40/a82eed/ffffff?text=U' : 'images/logo.png';
        const aiFallback = `onerror="this.src='https://via.placeholder.com/40/FF3385/FFFFFF?text=D';"`;

        // Format Gemini Bold (**text**) to HTML Bold (<b>text</b>)
        let formattedText = typeof text === 'string' ? text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>') : text;

        let downloadBtnHTML = role !== 'user' ? `<button class="download-btn tooltip" data-tooltip="İndir"><i class="fa-solid fa-download"></i></button>` : '';

        msgDiv.innerHTML = `
            <div class="message-avatar">
                <img src="${avatarSrc}" alt="${role}" ${role !== 'user' ? aiFallback : ''}>
            </div>
            <div class="message-content glass-bubble">
                <p>${isFile ? '<i>📁 ' + text + ' yüklendi.</i>' : formattedText}</p>
                ${downloadBtnHTML}
            </div>
        `;
        chatDisplay.appendChild(msgDiv);
        scrollToBottom();

        if (role === 'model' || role === 'ai') {
            speakText(text);
        }
    };

    // Download functionality using html2canvas
    chatDisplay.addEventListener('click', (e) => {
        const btn = e.target.closest('.download-btn');
        if (btn) {
            const bubble = btn.closest('.message-content');
            btn.style.display = 'none'; // hide button for screenshot

            // Add Watermark temporarily
            const watermark = document.createElement('div');
            watermark.innerHTML = "<b>Dedikodu AI</b> - @Melisa'ya Özel";
            watermark.style.fontSize = "10px";
            watermark.style.color = "rgba(255,255,255,0.4)";
            watermark.style.marginTop = "10px";
            watermark.style.textAlign = "right";
            bubble.appendChild(watermark);

            html2canvas(bubble, { backgroundColor: '#2d193c' }).then(canvas => {
                const link = document.createElement('a');
                link.download = 'giybet.png';
                link.href = canvas.toDataURL();
                link.click();
                
                // Cleanup
                btn.style.display = 'flex';
                watermark.remove();
            });
        }
    });

    // Initial render history
    if(chatHistory.length > 0) {
        // Clear default welcome message
        chatDisplay.innerHTML = '';
        chatHistory.forEach(h => {
             renderMessage(h.role, h.text);
        });
    }

    // Add Typing Indicator
    const showTypingIndicator = () => {
        const id = 'typing-' + Date.now();
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message ai-message zoom-in';
        msgDiv.id = id;
        msgDiv.innerHTML = `
            <div class="message-avatar">
                <img src="images/logo.png" alt="AI" onerror="this.src='https://via.placeholder.com/40/FF3385/FFFFFF?text=D';">
            </div>
            <div class="message-content glass-bubble">
                <div class="typing-indicator">
                    <div class="dot"></div>
                    <div class="dot"></div>
                    <div class="dot"></div>
                </div>
            </div>
        `;
        chatDisplay.appendChild(msgDiv);
        scrollToBottom();
        return id;
    };

    const removeTypingIndicator = (id) => {
        const typingMsg = document.getElementById(id);
        if(typingMsg) typingMsg.remove();
    };

    const updateHistory = (role, text) => {
        chatHistory.push({ role, text });
        // Keep only last 20 messages to avoid limit issues
        if(chatHistory.length > 20) chatHistory = chatHistory.slice(chatHistory.length - 20);
        localStorage.setItem('dedikodu_history', JSON.stringify(chatHistory));
    };

    // API Call
    const sendToAPI = async (text, file = null) => {
        const typingId = showTypingIndicator();
        
        try {
            const formData = new FormData();
            if (text) formData.append('message', text);
            if (file) formData.append('file', file);
            formData.append('persona', personaSelect.value);
            
            // Exclude the file event explicitly from the formatted history sent to API, Gemini needs clean dialogue for memory.
            formData.append('history', JSON.stringify(chatHistory));

            const response = await fetch('/api/chat', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            removeTypingIndicator(typingId);

            if (data.error) {
                renderMessage('ai', "🚨 Sistem Hatası 🚨 <br><br>" + data.error);
                return;
            }

            renderMessage('model', data.reply);
            updateHistory('model', data.reply);
            updateGossipMeter();
            
        } catch (error) {
            removeTypingIndicator(typingId);
            renderMessage('ai', "Ay işlemcim tıkandı tatlım! Sunucuya bağlanamıyorum, birisi Ethernet kablomu mu kemirdi?");
        }
    };

    // Process Message
    const handleSend = () => {
        const text = chatInput.value.trim();
        if(!text) return;

        renderMessage('user', text);
        updateHistory('user', text);
        chatInput.value = '';
        
        sendToAPI(text);
    };

    // Event Listeners for Chat
    sendBtn.addEventListener('click', handleSend);
    chatInput.addEventListener('keypress', (e) => {
        if(e.key === 'Enter') handleSend();
    });

    // Voice Recognition (Speech to Text)
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition;

    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.lang = 'tr-TR';
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onstart = () => {
            micBtn.classList.add('recording');
            chatInput.placeholder = "Dinliyorum, dökül bakalım...";
        };

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            chatInput.value = transcript;
            // handleSend(); // İstersen direk gönderebilirsin
        };

        recognition.onerror = (event) => {
            console.error('Ses tanıma hatası:', event.error);
            micBtn.classList.remove('recording');
            chatInput.placeholder = "Dedikoduyu yaz ayol, kimden bahsedeceğiz bugün?...";
        };

        recognition.onend = () => {
            micBtn.classList.remove('recording');
            chatInput.placeholder = "Dedikoduyu yaz ayol, kimden bahsedeceğiz bugün?...";
        };

        micBtn.addEventListener('click', () => {
            if (micBtn.classList.contains('recording')) {
                recognition.stop();
            } else {
                recognition.start();
            }
        });
    } else {
        micBtn.style.display = 'none';
        console.warn('Tarayıcınız ses tanıma özelliğini desteklemiyor.');
    }

    // File Upload / Drop Zone Logic
    uploadBtn.addEventListener('click', () => {
        fileDropZone.classList.toggle('active');
        if(fileDropZone.classList.contains('active')){
            setTimeout(() => {
                fileDropZone.classList.remove('active');
            }, 5000);
        }
    });

    fileDropZone.addEventListener('click', () => {
        hiddenFileInput.click();
    });

    const handleFileUpload = (file) => {
        fileDropZone.classList.remove('active', 'drag-over');
        renderMessage('user', file.name, true);
        
        // We will send file to API directly. We don't save the file in history, 
        // we might just say "A file was uploaded" in our local history if we wanted, 
        // but for Gemini we pass it in the prompt part.
        sendToAPI("Al canım, sana incelemen için dedikoduluk bir dosya/resim gönderdim. İçinde ne var?", file);
    };

    hiddenFileInput.addEventListener('change', (e) => {
        if(e.target.files.length > 0) {
            handleFileUpload(e.target.files[0]);
            e.target.value = ''; 
        }
    });

    // Drag & Drop Events
    const dropArea = document.querySelector('.chat-wrapper');

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults (e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, () => {
            fileDropZone.classList.add('active', 'drag-over');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, () => {
            fileDropZone.classList.remove('drag-over');
        }, false);
    });

    dropArea.addEventListener('drop', (e) => {
        fileDropZone.classList.remove('active');
        const dt = e.dataTransfer;
        const files = dt.files;
        if(files.length > 0) {
            handleFileUpload(files[0]);
        }
    }, false);

});
