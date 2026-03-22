document.addEventListener('DOMContentLoaded', () => {
    
    // -- TEMA DÖNGÜSÜ --
    const themes = ['', 'theme-light', 'theme-fire', 'theme-ocean'];
    let currentThemeIndex = parseInt(localStorage.getItem('dil_theme_index')) || 0;
    if (themes[currentThemeIndex]) document.body.classList.add(themes[currentThemeIndex]);

    document.getElementById('theme-toggle').addEventListener('click', () => {
        document.body.className = ''; 
        currentThemeIndex = (currentThemeIndex + 1) % themes.length;
        if (themes[currentThemeIndex]) document.body.classList.add(themes[currentThemeIndex]);
        localStorage.setItem('dil_theme_index', currentThemeIndex);
    });

    // --- GLOBAL DEĞİŞKENLER VE HAFIZA ---
    let rawKeys = localStorage.getItem('gemini_api_keys') || "";
    let API_KEYS = rawKeys ? rawKeys.split(',').map(k => k.trim()).filter(k => k !== "") : [];
    let currentKeyIndex = 0; 

    let nativeLang = localStorage.getItem('nativeLang') || "Türkçe";
    let studyLang = localStorage.getItem('studyLang') || "Almanca";
    let vault = JSON.parse(localStorage.getItem('myVault')) || [];
    
    // Kalıcı Hikaye Kütüphanesi KASASI
    let storyVault = JSON.parse(localStorage.getItem('myStories')) || []; 
    
    let sessionVault = [...vault]; 
    let currentCardIndex = 0;
    let aiCache = JSON.parse(localStorage.getItem('dil_ai_cache')) || {}; 
    let currentDrawerContext = ""; 
    let currentStoryAnalysisData = {}; // Arka planda çekilen verilerin tutulacağı RAM hafızası

    if (document.getElementById('native-language')) document.getElementById('native-language').value = nativeLang;
    if (document.getElementById('study-language')) document.getElementById('study-language').value = studyLang;

    // Başlangıçta Kütüphaneyi Çiz
    renderStoryList();

    // --- NAVİGASYON ---
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

    // --- AYARLAR ---
    document.getElementById('btn-save-key').addEventListener('click', () => {
        const keysInput = document.getElementById('api-key-input').value.trim();
        if (keysInput) { 
            localStorage.setItem('gemini_api_keys', keysInput); 
            API_KEYS = keysInput.split(',').map(k => k.trim()).filter(k => k !== "");
            currentKeyIndex = 0; 
            alert(`${API_KEYS.length} adet API Anahtarı sisteme kaydedildi!`); 
        }
    });
    if (rawKeys) document.getElementById('api-key-input').value = rawKeys;

    document.getElementById('native-language').addEventListener('change', (e) => { nativeLang = e.target.value; localStorage.setItem('nativeLang', nativeLang); });
    document.getElementById('study-language').addEventListener('change', (e) => { studyLang = e.target.value; localStorage.setItem('studyLang', studyLang); });
    
    document.getElementById('btn-clear-cache').addEventListener('click', () => {
        if(confirm("AI hafızası silinecek (Kayıtlı kelimelerin ve HİKAYELERİN silinmez). Emin misin?")) {
            aiCache = {};
            localStorage.setItem('dil_ai_cache', JSON.stringify(aiCache));
            alert("Hafıza temizlendi!");
        }
    });

    // --- AKILLI VE HAFIZALI AI MOTORU ---
    async function callGemini(cacheKey, prompt, expectJson = false) {
        if (cacheKey && aiCache[cacheKey]) {
            console.log("Hafızadan getirildi:", cacheKey);
            return aiCache[cacheKey]; 
        }

        if (API_KEYS.length === 0) { alert("Lütfen Ayarlar'dan API Key girin!"); return null; }
        
        let attempts = 0; 
        const payload = { contents: [{ parts: [{ text: prompt }] }] };
        
        if (expectJson) {
            payload.generationConfig = { responseMimeType: "application/json" };
        }

        while (attempts < API_KEYS.length) {
            let activeKey = API_KEYS[currentKeyIndex];
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${activeKey}`;
            
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await response.json();
                
                if (data.error) {
                    const errMsg = data.error.message.toLowerCase();
                    if (errMsg.includes("quota") || data.error.code === 429) {
                        currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
                        attempts++; continue; 
                    } else { alert("API Hatası: " + data.error.message); return null; }
                }
                
                if (data.candidates && data.candidates[0]) {
                    let resultText = data.candidates[0].content.parts[0].text;
                    
                    if (cacheKey) {
                        aiCache[cacheKey] = resultText;
                        try { localStorage.setItem('dil_ai_cache', JSON.stringify(aiCache)); } 
                        catch (e) { aiCache = {}; }
                    }
                    return resultText;
                }
            } catch (error) { alert("Bağlantı Hatası."); return null; }
        }
        alert("Sisteme girdiğin tüm API anahtarlarının kotası dolmuş!");
        return null;
    }

    // --- STÜDYO: HİKAYE ÜRETİMİ VE KÜTÜPHANE KAYDI ---
    document.getElementById('btn-generate-story').addEventListener('click', async () => {
        const input = document.getElementById('story-prompt').value.trim();
        const count = document.getElementById('story-count').value || 1;
        const btn = document.getElementById('btn-generate-story');
        
        if (!input) return;

        btn.innerText = "Üretiliyor...";
        btn.disabled = true;
        
        const prompt = `Lütfen "${input}" konusunda, ${studyLang} dilinde A1-A2 seviyesinde ${count} adet farklı kısa hikaye yaz. 
        SADECE JSON formatında bir dizi (array) döndür. Format: [{"title": "Hikaye Başlığı", "content": "Hikaye metni..."}]`;

        const responseText = await callGemini(null, prompt, true);
        
        btn.innerText = "Hikaye Üret";
        btn.disabled = false;

        if (!responseText) { alert("Hikaye üretilemedi."); return; }

        try {
            const stories = JSON.parse(responseText);
            stories.forEach(story => {
                storyVault.unshift({
                    id: Date.now() + Math.floor(Math.random() * 1000),
                    title: story.title,
                    content: story.content,
                    lang: studyLang
                });
            });
            localStorage.setItem('myStories', JSON.stringify(storyVault));
            renderStoryList();
        } catch(e) {
            console.error(e); alert("İçerik çekilemedi (JSON Hatası).");
        }
    });

    function renderStoryList() {
        const listContainer = document.getElementById('story-list-container');
        if (storyVault.length === 0) {
            listContainer.innerHTML = '<div class="empty-vault-msg">Henüz kayıtlı hikaye yok. Yukarıdan üretin.</div>';
            return;
        }
        listContainer.innerHTML = '';
        storyVault.forEach(story => {
            const div = document.createElement('div');
            div.className = 'story-item';
            div.innerHTML = `
                <div class="story-item-title"><i class="fa-solid fa-book"></i> ${story.title} <small style="color:#888; margin-left:5px;">(${story.lang})</small></div>
                <button class="mini-btn" onclick="event.stopPropagation(); deleteStory(${story.id})"><i class="fa-solid fa-trash"></i></button>
            `;
            div.addEventListener('click', () => {
                document.querySelector('[data-target="tab-lab"]').click();
                prepareLabText(story.content);
            });
            listContainer.appendChild(div);
        });
    }

    window.deleteStory = (id) => {
        if(confirm("Bu hikayeyi kütüphaneden silmek istediğine emin misin?")) {
            storyVault = storyVault.filter(s => s.id !== id);
            localStorage.setItem('myStories', JSON.stringify(storyVault));
            renderStoryList();
        }
    };

    // --- LAB: CÜMLE VE PARAGRAF ANALİZİ ---
    async function prepareLabText(text, isRestore = false) {
        sessionStorage.setItem('activeLabText', text); // Kaybolmasın diye kaydet
        currentStoryAnalysisData = {}; 
        const labContainer = document.getElementById('text-container');
        labContainer.innerHTML = '';
        
        const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

        sentences.forEach((sentText, index) => {
            const cleanSent = sentText.trim();
            const block = document.createElement('div');
            block.className = 'sentence-block';
            
            const textSpan = document.createElement('span');
            textSpan.className = 'sentence-text';
            textSpan.innerText = cleanSent;
            block.appendChild(textSpan);

            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'sentence-actions';
            
            const btnTrans = document.createElement('button');
            btnTrans.className = 'btn-action-sm action-trans'; btnTrans.innerHTML = '<i class="fa-solid fa-language"></i> Çevir';
            btnTrans.addEventListener('click', () => openDrawer(cleanSent, 'translate'));
            
            const btnGrammar = document.createElement('button');
            btnGrammar.className = 'btn-action-sm action-gram'; btnGrammar.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> İncele';
            btnGrammar.addEventListener('click', () => openDrawer(cleanSent, 'grammar'));

            const btnExtract = document.createElement('button');
            btnExtract.className = 'btn-action-sm extract action-ext'; btnExtract.innerHTML = '<i class="fa-solid fa-list-check"></i> Kelimeleri Ayıkla';
            btnExtract.addEventListener('click', () => openDrawer(cleanSent, 'extract'));

            actionsDiv.appendChild(btnTrans); actionsDiv.appendChild(btnGrammar); actionsDiv.appendChild(btnExtract);
            block.appendChild(actionsDiv); labContainer.appendChild(block);
        });

        if (!isRestore && API_KEYS.length > 0) {
            autoAnalyzeFullStory(text);
        }
    }

    // TOPLU ANALİZ MOTORU
    async function autoAnalyzeFullStory(fullText) {
        const buttons = document.querySelectorAll('.sentence-actions button');
        buttons.forEach(b => { b.disabled = true; b.style.opacity = '0.5'; });

        const cacheKey = `full_analysis_${studyLang}_${fullText.substring(0,30)}`;
        const prompt = `Şu ${studyLang} dilindeki metnin İÇİNDEKİ HER BİR CÜMLEYİ ayrı ayrı analiz et: "${fullText}". 
        SADECE JSON formatında bir dizi (array) döndür. Başka hiçbir açıklama yazma.
        Format şu şekilde olmalı: 
        [
          {
            "sentence": "Cümlenin orijinal tam hali",
            "translation": "Cümlenin ${nativeLang} çevirisi",
            "grammar": "Cümlenin dilbilgisi, zamanı ve kurallarının Türkçe kısa özeti",
            "words": [ {"word": "artikel+kelime", "translation": "Türkçesi", "pos": "isim/fiil/vs", "details": "çoğul/zaman/vs"} ]
          }
        ]`;

        const responseText = await callGemini(cacheKey, prompt, true);
        
        if (responseText) {
            try {
                const analysisArray = JSON.parse(responseText);
                analysisArray.forEach(item => {
                    currentStoryAnalysisData[item.sentence.trim()] = item;
                });
            } catch (e) {
                console.error("Toplu analiz JSON hatası:", e);
            }
        }

        buttons.forEach(b => { b.disabled = false; b.style.opacity = '1'; });
    }

    // -- OTURUM KURTARMA (Yanlışlıkla yenilemeye karşı) --
    const savedLabText = sessionStorage.getItem('activeLabText');
    if (savedLabText) {
        prepareLabText(savedLabText, true); 
    }

    // --- AI ÇEKMECESİ ---
    const drawer = document.getElementById('ai-drawer');
    const chatContainer = document.getElementById('chat-container');
    const extractionContainer = document.getElementById('extraction-container');
    const chatContent = document.getElementById('ai-response-content');
    const extractionList = document.getElementById('extraction-list');
    
    async function openDrawer(sentence, action) {
        currentDrawerContext = sentence;
        drawer.classList.remove('hidden');
        
        const preData = currentStoryAnalysisData[sentence];
        const hasPreData = preData !== undefined;

        if (action === 'extract') {
            chatContainer.classList.add('hidden');
            extractionContainer.classList.remove('hidden');
            document.getElementById('drawer-title').innerText = "Kelimeler Ayıklanıyor...";
            document.getElementById('btn-save-extracted').classList.add('hidden'); 
            
            if (hasPreData && preData.words) {
                renderExtractionList(JSON.stringify(preData.words), sentence);
            } else {
                extractionList.innerHTML = "<div style='padding:20px; text-align:center;'>Derin analiz yapılıyor, lütfen bekleyin...</div>";
                const cacheKey = `extract_${studyLang}_${sentence.substring(0,30)}`;
                const prompt = `Şu ${studyLang} cümlesindeki tüm kelimeleri analiz et: "${sentence}".
                SADECE JSON dizisi (array) döndür. Format:
                [{"word": "artikel+kelime (örn: der Mann / gehen)", "translation": "Türkçesi", "pos": "isim/fiil/sıfat vb.", "details": "çoğul/zaman/düzenli durumu veya ek bilgi", "example": "Cümledeki hali veya kısa örnek"}]`;
                const response = await callGemini(cacheKey, prompt, true);
                renderExtractionList(response, sentence);
            }

        } else {
            extractionContainer.classList.add('hidden');
            chatContainer.classList.remove('hidden');
            chatContent.innerHTML = ''; 
            
            if (action === 'translate') {
                document.getElementById('drawer-title').innerText = "Cümle Çevirisi";
                if (hasPreData && preData.translation) {
                    addChatMessage(preData.translation, 'ai');
                    return; 
                }
            } else {
                document.getElementById('drawer-title').innerText = "Gramer Analizi";
                if (hasPreData && preData.grammar) {
                    addChatMessage(preData.grammar, 'ai');
                    return; 
                }
            }
            
            let prompt = ""; let cacheKey = "";
            if (action === 'translate') {
                cacheKey = `trans_${studyLang}_${sentence.substring(0,30)}`;
                prompt = `Şu ${studyLang} cümlesini ${nativeLang} diline çevir: "${sentence}"`;
            } else {
                cacheKey = `gram_${studyLang}_${sentence.substring(0,30)}`;
                prompt = `Şu cümlenin dilbilgisini Türkçe açıkla. Zamanı, kuralları belirt: "${sentence}"`;
            }
            
            addChatMessage("Analiz ediliyor...", 'ai');
            const response = await callGemini(cacheKey, prompt, false);
            chatContent.innerHTML = ''; addChatMessage(response || "Hata oluştu.", 'ai');
        }
    }

    function renderExtractionList(jsonString, sentence) {
        if (!jsonString) { extractionList.innerHTML = "Veri çekilemedi."; return; }
        try {
            const words = JSON.parse(jsonString);
            document.getElementById('drawer-title').innerText = "Cümledeki Kelimeler";
            extractionList.innerHTML = '';
            
            words.forEach(item => {
                const row = document.createElement('div');
                row.className = 'extracted-row';
                
                const safeData = encodeURIComponent(JSON.stringify({
                    id: Date.now() + Math.floor(Math.random()*1000),
                    lang: studyLang,
                    frontWord: item.word,
                    pos: item.pos,
                    regularity: item.details,
                    example: sentence,
                    backTranslation: item.translation,
                    backExample: "-"
                }));

                row.innerHTML = `
                    <input type="checkbox" class="extracted-checkbox" value="${safeData}">
                    <div class="extracted-info">
                        <span class="ext-word">${item.word} <span class="ext-trans">- ${item.translation}</span></span>
                        <span class="ext-details">${item.pos} | ${item.details}</span>
                    </div>
                `;
                row.addEventListener('click', (e) => {
                    if(e.target.type !== 'checkbox') {
                        const cb = row.querySelector('.extracted-checkbox');
                        cb.checked = !cb.checked;
                    }
                });
                extractionList.appendChild(row);
            });
            document.getElementById('btn-save-extracted').classList.remove('hidden');

        } catch (e) { console.error(e); extractionList.innerHTML = "Analiz formatı hatalı."; }
    }

    document.getElementById('btn-save-extracted').addEventListener('click', () => {
        const checkboxes = document.querySelectorAll('.extracted-checkbox:checked');
        if (checkboxes.length === 0) { alert("Lütfen en az bir kelime seçin."); return; }
        
        let addedCount = 0;
        checkboxes.forEach(cb => {
            const cardData = JSON.parse(decodeURIComponent(cb.value));
            if(!vault.some(v => v.frontWord === cardData.frontWord)) {
                vault.unshift(cardData);
                addedCount++;
            }
        });

        if(addedCount > 0) {
            localStorage.setItem('myVault', JSON.stringify(vault));
            sessionVault = [...vault]; 
            renderVaultList(); renderFlashcard();
            alert(`${addedCount} kelime havuza başarıyla eklendi!`);
            document.getElementById('close-drawer').click(); 
        } else {
            alert("Seçtiğin kelimeler zaten havuzunda mevcut.");
        }
    });

    document.getElementById('btn-drawer-send').addEventListener('click', async () => {
        const inputEl = document.getElementById('drawer-chat-input');
        const question = inputEl.value.trim();
        if (!question) return;
        addChatMessage(question, 'user'); inputEl.value = '';

        const prompt = `Cümle: "${currentDrawerContext}". Soru: "${question}". Kısa ve net cevap ver.`;
        const loadingDiv = document.createElement('div'); loadingDiv.className = 'chat-msg chat-ai'; loadingDiv.innerText = "...";
        chatContent.appendChild(loadingDiv); chatContent.scrollTop = chatContent.scrollHeight;

        const answer = await callGemini(null, prompt, false); 
        loadingDiv.remove(); addChatMessage(answer || "Yanıt alınamadı.", 'ai');
    });

    function addChatMessage(text, sender) {
        const msgDiv = document.createElement('div'); msgDiv.className = `chat-msg chat-${sender}`;
        msgDiv.innerText = text; chatContent.appendChild(msgDiv); chatContent.scrollTop = chatContent.scrollHeight;
    }
    document.getElementById('close-drawer').addEventListener('click', () => { drawer.classList.add('hidden'); });

    // --- FLASHCARD & LİSTE RENDER ---
    document.getElementById('btn-random-session').addEventListener('click', () => {
        if (vault.length === 0) { alert("Havuz boş!"); return; }
        let shuffled = [...vault].sort(() => 0.5 - Math.random());
        sessionVault = shuffled.slice(0, 20);
        currentCardIndex = 0;
        renderFlashcard();
        alert(`20 kelimelik rastgele çalışma oturumu başlatıldı!`);
    });

    function renderFlashcard() {
        const container = document.getElementById('flashcard-container');
        const controls = document.getElementById('flashcard-controls');
        
        if (sessionVault.length === 0) {
            container.innerHTML = '<div class="empty-vault-msg">Havuz boş. Önce kelime kaydedin.</div>';
            controls.classList.add('hidden');
            return;
        }

        controls.classList.remove('hidden');
        document.getElementById('card-counter').innerText = `${currentCardIndex + 1} / ${sessionVault.length}`;
        const cardData = sessionVault[currentCardIndex];

        container.innerHTML = `
            <div class="flashcard" onclick="this.classList.toggle('flipped')">
                <div class="card-face card-front">
                    <div class="fc-word">${cardData.frontWord || "Hata"}</div>
                    <div class="fc-type">${cardData.pos || ""} | ${cardData.regularity || ""}</div>
                    <div class="fc-example">"${cardData.example || ""}"</div>
                    <div class="fc-hint">Çeviri için dokun <i class="fa-solid fa-rotate"></i></div>
                </div>
                <div class="card-face card-back">
                    <div class="fc-word">${cardData.backTranslation || ""}</div>
                    <div class="fc-type">Türkçe Karşılığı</div>
                    <div class="fc-example">"${cardData.backExample || "-"}"</div>
                </div>
            </div>
        `;
    }

    document.getElementById('btn-prev-card').addEventListener('click', () => {
        if (currentCardIndex > 0) { currentCardIndex--; renderFlashcard(); }
    });
    
    document.getElementById('btn-next-card').addEventListener('click', () => {
        if (currentCardIndex < sessionVault.length - 1) { currentCardIndex++; renderFlashcard(); }
    });

    function renderVaultList() {
        const list = document.getElementById('vault-list');
        if(!list) return;
        list.innerHTML = vault.length === 0 ? '<p>Havuz boş.</p>' : '';
        vault.forEach(item => {
            const card = document.createElement('div');
            card.className = 'word-card';
            card.innerHTML = `<div><small>${item.lang}</small><div><strong>${item.frontWord}</strong></div></div>
                              <button class="mini-btn" onclick="deleteWord(${item.id})"><i class="fa-solid fa-trash"></i></button>`;
            list.appendChild(card);
        });
    }

    window.deleteWord = (id) => {
        vault = vault.filter(v => v.id !== id);
        sessionVault = sessionVault.filter(v => v.id !== id);
        localStorage.setItem('myVault', JSON.stringify(vault));
        if(currentCardIndex >= sessionVault.length) currentCardIndex = Math.max(0, sessionVault.length - 1);
        renderVaultList(); renderFlashcard();
    };
    
    document.getElementById('btn-clear-all').addEventListener('click', () => {
        if(confirm("Tüm kelimeleri silmek istediğine emin misin?")) {
            vault = []; sessionVault = []; localStorage.setItem('myVault', JSON.stringify(vault));
            currentCardIndex = 0; renderVaultList(); renderFlashcard();
        }
    });

    document.getElementById('btn-export-vault').addEventListener('click', () => {
        if(vault.length === 0) { alert("Havuz boş!"); return; }
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(vault));
        const dlAnchorElem = document.createElement('a');
        dlAnchorElem.setAttribute("href", dataStr); dlAnchorElem.setAttribute("download", "dil_ai_yedek.json"); dlAnchorElem.click();
    });

    document.getElementById('import-vault').addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                if(Array.isArray(importedData)) {
                    vault = importedData; sessionVault = [...vault];
                    localStorage.setItem('myVault', JSON.stringify(vault));
                    currentCardIndex = 0; alert("Yedek yüklendi!"); renderVaultList(); renderFlashcard();
                }
            } catch(err) { alert("Hata oluştu."); }
        };
        reader.readAsText(file);
    });

});
