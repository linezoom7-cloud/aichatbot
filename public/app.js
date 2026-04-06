document.addEventListener('DOMContentLoaded', () => {
    const chatDisplay = document.getElementById('chat-display');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const uploadBtn = document.getElementById('upload-btn');
    const hiddenFileInput = document.getElementById('hidden-file-input');
    const fileDropZone = document.getElementById('file-drop-zone');

    // Load History
    let chatHistory = JSON.parse(localStorage.getItem('dedikodu_history')) || [];

    const scrollToBottom = () => {
        chatDisplay.scrollTop = chatDisplay.scrollHeight;
    };

    // Render message
    const renderMessage = (role, text, isFile = false) => {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${role === 'user' ? 'user-message' : 'ai-message'} zoom-in`;
        
        let avatarSrc = role === 'user' ? 'https://via.placeholder.com/40/a82eed/ffffff?text=U' : 'images/logo.png';
        const aiFallback = `onerror="this.src='https://via.placeholder.com/40/FF3385/FFFFFF?text=D';"`;

        // Format Gemini Bold (**text**) to HTML Bold (<b>text</b>)
        let formattedText = typeof text === 'string' ? text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>') : text;

        msgDiv.innerHTML = `
            <div class="message-avatar">
                <img src="${avatarSrc}" alt="${role}" ${role !== 'user' ? aiFallback : ''}>
            </div>
            <div class="message-content glass-bubble">
                <p>${isFile ? '<i>📁 ' + text + ' yüklendi.</i>' : formattedText}</p>
            </div>
        `;
        chatDisplay.appendChild(msgDiv);
        scrollToBottom();
    };

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
