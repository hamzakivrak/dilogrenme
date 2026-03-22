document.addEventListener('DOMContentLoaded', () => {
    
    let API_KEY = localStorage.getItem('gemini_api_key') || "";
    let nativeLang = localStorage.getItem('nativeLang') || "Türkçe";
    let studyLang = localStorage.getItem('studyLang') || "Almanca";
    let vault = JSON.parse(localStorage.getItem('myVault')) || [];
    let selectedText = ""; 
    let currentDrawerContext = ""; 
    let currentCardIndex = 0;

    if (document.getElementById('native-language')) document.getElementById('native-language').value = nativeLang;
    if (document.getElementById('study-language')) document.getElementById('study-language').value = studyLang;

    const navBtns = document.querySelectorAll('.nav-btn');
    const sections = document.querySelectorAll('.tab-section');
    navBtns.forEach(btn => btn.addEventListener('click', () => {
        navBtns.forEach(b => b.classList.remove('active'));
        sections.forEach(s => s.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.getAttribute('data-target');
        document.getElementById(target).classList.add('active');
        if (target === 'tab-vocab') { renderVaultList(); renderFlashcard(); }
    }));

    const subNavBtns = document.querySelectorAll('.sub-nav-btn');
    const subSections = document.querySelectorAll('.sub-section');
    subNavBtns.forEach(btn => btn.addEventListener('click', () => {
        subNavBtns.forEach(b => b.classList.remove('active'));
        subSections.forEach(s => s.classList.add('hidden'));
        btn.classList.add('active');
        document.getElementById(btn.getAttribute('data-sub')).classList.remove('hidden');
    }));

    document.getElementById('btn-save-key').addEventListener('click', () => {
        const key = document.getElementById('api-key-input').value.trim();
        if (key) { localStorage.setItem('gemini_api_key', key); API_KEY = key; alert("API Anahtarı kaydedildi!"); }
    });
    if (API_KEY) document.getElementById('api-key-input').value = API_KEY;

    document.getElementById('native-language').addEventListener('change', (e) => { nativeLang = e.target.value; localStorage.setItem('nativeLang', nativeLang); });
    document.getElementById('study-language').addEventListener('change', (e) => { studyLang = e.target.value; localStorage.setItem('studyLang', studyLang); });

    // --- YAPAY ZEKA MOTORU (HATA DEDEKTİFİ EKLENDİ) ---
    async function callGemini(prompt, isLite = false, expectJson = false) {
        if (!API_KEY) { alert("Lütfen Ayarlar'dan API Key girin!"); return null; }
        const modelName = isLite ? 'gemini-2.5-flash-lite' : 'gemini-2.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${API_KEY}`;
        
        const payload = { contents: [{ parts: [{ text: prompt }] }] };
        
        if (expectJson) {
            payload.generationConfig = { responseMimeType: "application/json" };
        }

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            
            // DEDEKTİF KODU BURADA: Hata varsa ekrana fırlatacak
            if (data.error) {
                console.error("API Hatası:", data.error);
                alert("Google API Hatası: " + data.error.message); 
                return null;
            }
            if (!data.candidates || !data.candidates[0]) {
                alert("Yapay zeka boş bir yanıt gönderdi. Lütfen tekrar dene.");
                return null;
            }
            return data.candidates[0].content.parts[0].text;
        } catch (error) {
            console.error("Bağlantı Hatası:", error);
            alert("İnternet veya Bağlantı Hatası: " + error.message);
            return null;
        }
    }

    document.getElementById('btn-generate-story').addEventListener('click', async () => {
        const input = document.getElementById('story-prompt').value;
        const display = document.getElementById('generated-story-display');
        if (!input) return;

        display.style.display = 'block';
        display.innerText = "Yapay zeka metni yazıyor...";
        const prompt = `Lütfen "${input}" konusu hakkında sadece ${studyLang} dilinde kısa bir metin yaz. Başka hiçbir dilde açıklama yapma.`;
        const story = await callGemini(prompt, false, false); 
        if (story) { display.innerText = story; prepareLabText(story); }
        else { display.innerText = "Metin oluşturulurken bir hata oluştu."; }
    });

    function prepareLabText(text) {
        const labContainer = document.getElementById('text-container');
        labContainer.innerHTML = '';
        const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

        sentences.forEach(sentText => {
            const block = document.createElement('div');
            block.className = 'sentence-block';
            const words = sentText.trim().split(/\s+/);
            words.forEach(word => {
                const wordSpan = document.createElement('span');
                wordSpan.innerText = word + " ";
                wordSpan.className = 'clickable-word';
                wordSpan.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectedText = word.replace(/[.,!?]/g, ''); 
                    showBubbleAtElement(wordSpan, selectedText);
                });
                block.appendChild(wordSpan);
            });

            const actionsDiv = document.createElement('span');
            actionsDiv.className = 'sentence-actions';
            const btnTrans = document.createElement('button');
            btnTrans.className = 'btn-translate'; btnTrans.innerHTML = '<i class="fa-solid fa-language"></i> Çevir';
            btnTrans.addEventListener('click', () => openDrawer(sentText.trim(), 'translate'));
            const btnGrammar = document.createElement('button');
            btnGrammar.className = 'btn-grammar'; btnGrammar.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> İncele';
            btnGrammar.addEventListener('click', () => openDrawer(sentText.trim(), 'grammar'));

            actionsDiv.appendChild(btnTrans); actionsDiv.appendChild(btnGrammar);
            block.appendChild(actionsDiv); labContainer.appendChild(block);
        });
    }

    const bubble = document.getElementById('word-bubble');
    function showBubbleAtElement(el, text) {
        const rect = el.getBoundingClientRect();
        document.getElementById('bubble-translation').innerText = text;
        bubble.style.left = (rect.left + rect.width / 2) + window.scrollX + 'px';
        bubble.style.top = (rect.top + window.scrollY - 10) + 'px';
        bubble.style.display = 'flex';
        getQuickTranslation(text);
    }

    async function getQuickTranslation(word) {
        const span = document.getElementById('bubble-translation');
        span.innerText = "Çevriliyor...";
        const prompt = `Sadece şu kelimenin ${nativeLang} dilindeki tek kelimelik karşılığını ver: "${word}"`;
        const result = await callGemini(prompt, true, false); 
        span.innerText = result ? result.trim() : word;
    }

    document.addEventListener('pointerup', (e) => {
        if (!e.target.closest('#word-bubble') && !e.target.closest('.clickable-word')) { bubble.style.display = 'none'; }
    });

    const drawer = document.getElementById('ai-drawer');
    const chatContent = document.getElementById('ai-response-content');
    
    async function openDrawer(sentence, action) {
        currentDrawerContext = sentence;
        drawer.classList.remove('hidden');
        chatContent.innerHTML = ''; 
        let prompt = ""; let loadingMsg = "";

        if (action === 'translate') {
            loadingMsg = "Çeviri yapılıyor..."; prompt = `Lütfen şu ${studyLang} cümlesini ${nativeLang} diline çevir: "${sentence}"`;
            document.getElementById('drawer-title').innerText = "Cümle Çevirisi";
        } else {
            loadingMsg = "Gramer analiz ediliyor..."; prompt = `Lütfen şu cümlenin dilbilgisini ${nativeLang} dilinde açıkla. Zamanı, kuralları ve önemli kelimeleri belirt: "${sentence}"`;
            document.getElementById('drawer-title').innerText = "Gramer Analizi";
        }
        addChatMessage(loadingMsg, 'ai');
        const response = await callGemini(prompt, false, false);
        chatContent.innerHTML = ''; addChatMessage(response || "Hata oluştu, lütfen tekrar dene.", 'ai');
    }

    document.getElementById('btn-drawer-send').addEventListener('click', async () => {
        const inputEl = document.getElementById('drawer-chat-input');
        const question = inputEl.value.trim();
        if (!question) return;
        addChatMessage(question, 'user'); inputEl.value = '';

        const aiContextPrompt = `Şu an üzerinde çalıştığımız ${studyLang} cümlesi: "${currentDrawerContext}". Kullanıcı sana bu cümleyle ilgili ${nativeLang} dilinde şu soruyu soruyor: "${question}". Lütfen detaylı ve anlaşılır cevap ver.`;
        
        const loadingDiv = document.createElement('div'); loadingDiv.className = 'chat-msg chat-ai'; loadingDiv.innerText = "Düşünüyor...";
        chatContent.appendChild(loadingDiv); chatContent.scrollTop = chatContent.scrollHeight;

        const answer = await callGemini(aiContextPrompt, false, false);
        loadingDiv.remove(); addChatMessage(answer || "Yanıt alınamadı.", 'ai');
    });

    function addChatMessage(text, sender) {
        const msgDiv = document.createElement('div'); msgDiv.className = `chat-msg chat-${sender}`;
        msgDiv.innerText = text; chatContent.appendChild(msgDiv); chatContent.scrollTop = chatContent.scrollHeight;
    }
    document.getElementById('close-drawer').addEventListener('click', () => { drawer.classList.add('hidden'); });

    document.getElementById('btn-speak').addEventListener('click', (e) => {
        e.stopPropagation();
        const ut = new SpeechSynthesisUtterance(selectedText);
        ut.lang = studyLang === 'Almanca' ? 'de-DE' : (studyLang === 'İngilizce' ? 'en-US' : 'es-ES');
        window.speechSynthesis.speak(ut);
    });

    document.getElementById('btn-save').addEventListener('click', async (e) => {
        e.stopPropagation();
        if(!selectedText) return;
        
        if(vault.some(v => v.originalWord === selectedText)) { alert("Bu kelime zaten havuzunda!"); return; }

        bubble.style.display = 'none';
        alert(`"${selectedText}" için detaylar yapay zekadan çekiliyor, lütfen bekle...`);

        const prompt = `Lütfen "${selectedText}" kelimesi için ${studyLang} dilinden ${nativeLang} diline detaylı bilgi ver.
        Format şu olmalı (SADECE JSON):
        {
          "word": "artikel + kelime",
          "pos": "kelime türü",
          "regularity": "düzenli/düzensiz",
          "example": "örnek cümle",
          "translation": "çevirisi",
          "exampleTranslation": "örnek cümle çevirisi"
        }`;

        let jsonResponse = await callGemini(prompt, false, true);
        
        if (!jsonResponse) {
            alert("Kelime bilgileri çekilemedi. Bağlantını kontrol et.");
            return;
        }

        try {
            const richData = JSON.parse(jsonResponse);
            
            const newCard = {
                id: Date.now(),
                originalWord: selectedText,
                lang: studyLang,
                frontWord: richData.word || selectedText,
                pos: richData.pos || "-",
                regularity: richData.regularity || "-",
                example: richData.example || "-",
                backTranslation: richData.translation || "-",
                backExample: richData.exampleTranslation || "-"
            };
            
            vault.unshift(newCard); 
            localStorage.setItem('myVault', JSON.stringify(vault));
            
            currentCardIndex = 0; 
            renderVaultList();
            renderFlashcard(); 
            
            alert("Kart başarıyla oluşturuldu ve havuza eklendi!");
            
        } catch(err) {
            console.error("JSON Parse Hatası:", err, "Gelen Yanıt:", jsonResponse);
            alert("Kelime kaydedilirken AI format hatası yaptı, tekrar dene.");
        }
    });

    function renderFlashcard() {
        const container = document.getElementById('flashcard-container');
        const controls = document.getElementById('flashcard-controls');
        
        if (vault.length === 0) {
            container.innerHTML = '<div class="empty-vault-msg">Havuz boş. Önce kelime kaydedin.</div>';
            controls.classList.add('hidden');
            return;
        }

        controls.classList.remove('hidden');
        document.getElementById('card-counter').innerText = `${currentCardIndex + 1} / ${vault.length}`;
        const cardData = vault[currentCardIndex];

        const fWord = cardData.frontWord || cardData.text || cardData.originalWord;
        const bTrans = cardData.backTranslation || "Çeviri Bulunamadı (Silip tekrar ekleyin)";
        const exTgt = cardData.example || "-";
        const exNat = cardData.backExample || "-";
        const details = cardData.pos ? `${cardData.pos} | ${cardData.regularity}` : "Detay Yok";

        container.innerHTML = `
            <div class="flashcard" onclick="this.classList.toggle('flipped')">
                <div class="card-face card-front">
                    <div class="fc-word">${fWord}</div>
                    <div class="fc-type">${details}</div>
                    <div class="fc-example">"${exTgt}"</div>
                    <div class="fc-hint">Çeviri için dokun <i class="fa-solid fa-rotate"></i></div>
                </div>
                <div class="card-face card-back">
                    <div class="fc-word">${bTrans}</div>
                    <div class="fc-type">Türkçe Karşılığı</div>
                    <div class="fc-example">"${exNat}"</div>
                </div>
            </div>
        `;
    }

    document.getElementById('btn-prev-card').addEventListener('click', () => {
        if (currentCardIndex > 0) { currentCardIndex--; renderFlashcard(); }
    });
    
    document.getElementById('btn-next-card').addEventListener('click', () => {
        if (currentCardIndex < vault.length - 1) { currentCardIndex++; renderFlashcard(); }
    });

    function renderVaultList() {
        const list = document.getElementById('vault-list');
        if(!list) return;
        list.innerHTML = vault.length === 0 ? '<p>Havuz boş.</p>' : '';
        vault.forEach(item => {
            const displayWord = item.frontWord || item.text || item.originalWord;
            const card = document.createElement('div');
            card.className = 'word-card';
            card.innerHTML = `<div><small>${item.lang}</small><div><strong>${displayWord}</strong></div></div>
                              <button class="mini-btn" onclick="deleteWord(${item.id})"><i class="fa-solid fa-trash"></i></button>`;
            list.appendChild(card);
        });
    }

    window.deleteWord = (id) => {
        vault = vault.filter(v => v.id !== id);
        localStorage.setItem('myVault', JSON.stringify(vault));
        if(currentCardIndex >= vault.length) currentCardIndex = Math.max(0, vault.length - 1);
        renderVaultList(); renderFlashcard();
    };
    
    document.getElementById('btn-clear-all').addEventListener('click', () => {
        if(confirm("Tüm kelimeleri silmek istediğine emin misin?")) {
            vault = []; localStorage.setItem('myVault', JSON.stringify(vault));
            currentCardIndex = 0; renderVaultList(); renderFlashcard();
        }
    });

    document.getElementById('btn-export-vault').addEventListener('click', () => {
        if(vault.length === 0) { alert("Havuz boş, yedeklenecek bir şey yok!"); return; }
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(vault));
        const dlAnchorElem = document.createElement('a');
        dlAnchorElem.setAttribute("href", dataStr);
        dlAnchorElem.setAttribute("download", "dil_ai_yedek.json");
        dlAnchorElem.click();
    });

    document.getElementById('import-vault').addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                if(Array.isArray(importedData)) {
                    vault = importedData;
                    localStorage.setItem('myVault', JSON.stringify(vault));
                    currentCardIndex = 0;
                    alert("Yedek başarıyla yüklendi!");
                    renderVaultList(); renderFlashcard();
                } else { alert("Geçersiz dosya formatı."); }
            } catch(err) { alert("Dosya okunurken hata oluştu."); }
        };
        reader.readAsText(file);
    });

    renderVaultList();
});
