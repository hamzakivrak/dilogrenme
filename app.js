document.addEventListener('DOMContentLoaded', () => {
    
    // -- TEMA SİSTEMİ (Dropdown Menü) --
    const themeSelect = document.getElementById('theme-select');
    let savedTheme = localStorage.getItem('dil_theme_class') || "";
    if (savedTheme) {
        document.body.classList.add(savedTheme);
        themeSelect.value = savedTheme;
    }

    themeSelect.addEventListener('change', (e) => {
        document.body.className = ''; 
        const selectedClass = e.target.value;
        if (selectedClass) document.body.classList.add(selectedClass);
        localStorage.setItem('dil_theme_class', selectedClass);
    });

    // --- GLOBAL DEĞİŞKENLER VE HAFIZA ---
    let rawKeys = localStorage.getItem('gemini_api_keys') || "";
    let API_KEYS = rawKeys ? rawKeys.split(',').map(k => k.trim()).filter(k => k !== "") : [];
    let currentKeyIndex = 0; 

    let nativeLang = localStorage.getItem('nativeLang') || "Türkçe";
    let studyLang = localStorage.getItem('studyLang') || "Almanca";
    let vault = JSON.parse(localStorage.getItem('myVault')) || [];
    let storyVault = JSON.parse(localStorage.getItem('myStories')) || []; 
    let sessionVault = [...vault]; 
    let currentCardIndex = 0;
    let aiCache = JSON.parse(localStorage.getItem('dil_ai_cache')) || {}; 
    let currentDrawerContext = ""; 
    let currentStoryAnalysisData = {}; 

    if (document.getElementById('native-language')) document.getElementById('native-language').value = nativeLang;
    if (document.getElementById('study-language')) document.getElementById('study-language').value = studyLang;

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

    // --- AKILLI AI MOTORU ---
    async function callGemini(cacheKey, prompt, expectJson = false) {
        if (cacheKey && aiCache[cacheKey]) return aiCache[cacheKey]; 
        if (API_KEYS.length === 0) { alert("Lütfen Ayarlar'dan API Key girin!"); return null; }
        
        let attempts = 0; 
        const payload = { contents: [{ parts: [{ text: prompt }] }] };
        if (expectJson) payload.generationConfig = { responseMimeType: "application/json" };

        while (attempts < API_KEYS.length) {
            let activeKey = API_KEYS[currentKeyIndex];
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${activeKey}`;
            try {
                const response = await fetch(url, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
                });
                const data = await response.json();
                
                if (data.error) {
                    if (data.error.message.toLowerCase().includes("quota") || data.error.code === 429) {
                        currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length; attempts++; continue; 
                    } else { alert("API Hatası: " + data.error.message); return null; }
                }
                if (data.candidates && data.candidates[0]) {
                    let resultText = data.candidates[0].content.parts[0].text;
                    if (cacheKey) { aiCache[cacheKey] = resultText; try { localStorage.setItem('dil_ai_cache', JSON.stringify(aiCache)); } catch (e) { aiCache = {}; } }
                    return resultText;
                }
            } catch (error) { return null; }
        }
        alert("Kotan doldu!"); return null;
    }

    // --- STÜDYO: HİKAYE ÜRETİMİ ---
    document.getElementById('btn-generate-story').addEventListener('click', async () => {
        const input = document.getElementById('story-prompt').value.trim();
        const count = document.getElementById('story-count').value || 1;
        const btn = document.getElementById('btn-generate-story');
        if (!input) return;

        btn.innerText = "Üretiliyor..."; btn.disabled = true;
        
        const prompt = `Lütfen "${input}" konusunda, ${studyLang} dilinde A1-A2 seviyesinde ${count} adet farklı kısa hikaye yaz. 
        SADECE JSON formatında bir dizi (array) döndür. Format: [{"title": "Hikaye Başlığı", "content": "Hikaye metni..."}]`;

        const responseText = await callGemini(null, prompt, true);
        btn.innerText = "Hikaye Üret"; btn.disabled = false;

        if (!responseText) { alert("Hikaye üretilemedi."); return; }
        try {
            const stories = JSON.parse(responseText);
            stories.forEach(story => {
                storyVault.unshift({ id: Date.now() + Math.floor(Math.random() * 1000), title: story.title, content: story.content, lang: studyLang });
            });
            localStorage.setItem('myStories', JSON.stringify(storyVault));
            renderStoryList();
        } catch(e) { alert("JSON Hatası."); }
    });

    function renderStoryList() {
        const listContainer = document.getElementById('story-list-container');
        if (storyVault.length === 0) { listContainer.innerHTML = '<div class="empty-vault-msg">Henüz kayıtlı hikaye yok.</div>'; return; }
        listContainer.innerHTML = '';
        storyVault.forEach(story => {
            const div = document.createElement('div'); div.className = 'story-item';
            div.innerHTML = `<div class="story-item-title"><i class="fa-solid fa-book"></i> ${story.title}</div>
                             <button class="mini-btn" onclick="event.stopPropagation(); deleteStory(${story.id})"><i class="fa-solid fa-trash"></i></button>`;
            div.addEventListener('click', () => {
                document.querySelector('[data-target="tab-lab"]').click();
                prepareLabText(story.content);
            });
            listContainer.appendChild(div);
        });
    }

    window.deleteStory = (id) => {
        if(confirm("Hikayeyi silmek istediğine emin misin?")) {
            storyVault = storyVault.filter(s => s.id !== id);
            localStorage.setItem('myStories', JSON.stringify(storyVault));
            renderStoryList();
        }
    };

    // --- LAB: CÜMLE VE PARAGRAF ANALİZİ ---
    async function prepareLabText(text, isRestore = false) {
        sessionStorage.setItem('activeLabText', text);
        currentStoryAnalysisData = {}; 
        const labContainer = document.getElementById('text-container');
        labContainer.innerHTML = '';
        
        const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

        sentences.forEach((sentText) => {
            const cleanSent = sentText.trim();
            const block = document.createElement('div'); block.className = 'sentence-block';
            
            const textSpan = document.createElement('span'); textSpan.className = 'sentence-text'; textSpan.innerText = cleanSent;
            block.appendChild(textSpan);

            const actionsDiv = document.createElement('div'); actionsDiv.className = 'sentence-actions';
            
            const btnTrans = document.createElement('button'); btnTrans.className = 'btn-action-sm action-trans'; btnTrans.innerHTML = '<i class="fa-solid fa-language"></i> Çevir';
            btnTrans.addEventListener('click', () => openDrawer(cleanSent, 'translate'));
            
            const btnGrammar = document.createElement('button'); btnGrammar.className = 'btn-action-sm action-gram'; btnGrammar.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> İncele';
            btnGrammar.addEventListener('click', () => openDrawer(cleanSent, 'grammar'));

            const btnExtract = document.createElement('button'); btnExtract.className = 'btn-action-sm extract action-ext'; btnExtract.innerHTML = '<i class="fa-solid fa-list-check"></i> Kelimeleri Ayıkla';
            btnExtract.addEventListener('click', () => openDrawer(cleanSent, 'extract'));

            actionsDiv.appendChild(btnTrans); actionsDiv.appendChild(btnGrammar); actionsDiv.appendChild(btnExtract);
            block.appendChild(actionsDiv); labContainer.appendChild(block);
        });

        if (!isRestore && API_KEYS.length > 0) {
            autoAnalyzeFullStory(text);
        }
    }

    // TOPLU ANALİZ MOTORU & YÜKLEME DURUMU
    async function autoAnalyzeFullStory(fullText) {
        const buttons = document.querySelectorAll('.sentence-actions button');
        buttons.forEach(b => { b.disabled = true; });
        
        const statusBadge = document.getElementById('analysis-status');
        statusBadge.classList.remove('hidden', 'success');
        statusBadge.innerHTML = '<i class="fa-solid fa-spinner"></i> <span>Yapay Zeka Metni Analiz Ediyor... Lütfen bekleyiniz.</span>';

        const cacheKey = `full_analysis_${studyLang}_${fullText.substring(0,30)}`;
        const prompt = `Şu ${studyLang} dilindeki metnin İÇİNDEKİ HER BİR CÜMLEYİ ayrı ayrı analiz et: "${fullText}". 
        SADECE JSON formatında bir dizi (array) döndür. 
        Format şu şekilde olmalı: 
        [
          {
            "sentence": "Cümlenin orijinal tam hali",
            "translation": "Cümlenin ${nativeLang} çevirisi",
            "grammar": "Cümlenin dilbilgisi, zamanı ve kurallarının Türkçe kısa özeti",
            "words": [ {"word": "KESİNLİKLE ARTIKELİYLE BİRLİKTE kelime (örn: der Tisch, das Haus, gehen)", "translation": "Türkçesi", "pos": "isim/fiil", "details": "çoğul/zaman/vs", "example": "Kelimenin geçtiği örnek cümle", "example_tr": "Örnek cümlenin Türkçe çevirisi"} ]
          }
        ]`;

        const responseText = await callGemini(cacheKey, prompt, true);
        
        if (responseText) {
            try {
                const analysisArray = JSON.parse(responseText);
                analysisArray.forEach(item => { currentStoryAnalysisData[item.sentence.trim()] = item; });
                
                statusBadge.classList.add('success');
                statusBadge.innerHTML = '<i class="fa-solid fa-check"></i> <span>Analiz Tamamlandı!</span>';
                setTimeout(() => statusBadge.classList.add('hidden'), 3000);
            } catch (e) {
                statusBadge.classList.add('hidden');
            }
        } else {
            statusBadge.classList.add('hidden');
        }

        buttons.forEach(b => { b.disabled = false; });
    }

    const savedLabText = sessionStorage.getItem('activeLabText');
    if (savedLabText) prepareLabText(savedLabText, true); 

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

        // Orijinal Cümleyi Başlığa Yaz
        document.getElementById('drawer-title').innerText = sentence;

        if (action === 'extract') {
            document.getElementById('drawer-action-name').innerText = "Kelimeler Ayıklanıyor";
            chatContainer.classList.add('hidden'); extractionContainer.classList.remove('hidden');
            document.getElementById('btn-save-extracted').classList.add('hidden'); 
            
            if (hasPreData && preData.words) {
                renderExtractionList(JSON.stringify(preData.words), sentence);
            } else {
                extractionList.innerHTML = "<div style='padding:20px; text-align:center;'>Derin analiz yapılıyor, lütfen bekleyin...</div>";
                const cacheKey = `extract_${studyLang}_${sentence.substring(0,30)}`;
                const prompt = `Şu ${studyLang} cümlesindeki tüm kelimeleri analiz et: "${sentence}".
                SADECE JSON dizisi döndür. Format: [{"word": "KESİNLİKLE ARTIKELİYLE BİRLİKTE kelime (örn: der Tisch)", "translation": "Türkçesi", "pos": "isim/fiil", "details": "detay", "example": "Örnek cümle", "example_tr": "Örnek cümlenin Türkçe çevirisi"}]`;
                const response = await callGemini(cacheKey, prompt, true);
                renderExtractionList(response, sentence);
            }
        } else {
            extractionContainer.classList.add('hidden'); chatContainer.classList.remove('hidden'); chatContent.innerHTML = ''; 
            
            if (action === 'translate') {
                document.getElementById('drawer-action-name').innerText = "Cümle Çevirisi";
                if (hasPreData && preData.translation) { addChatMessage(preData.translation, 'ai'); return; }
            } else {
                document.getElementById('drawer-action-name').innerText = "Gramer Analizi";
                if (hasPreData && preData.grammar) { addChatMessage(preData.grammar, 'ai'); return; }
            }
            
            let prompt = ""; let cacheKey = "";
            if (action === 'translate') {
                cacheKey = `trans_${studyLang}_${sentence.substring(0,30)}`; prompt = `Şu ${studyLang} cümlesini ${nativeLang} diline çevir: "${sentence}"`;
            } else {
                cacheKey = `gram_${studyLang}_${sentence.substring(0,30)}`; prompt = `Şu cümlenin dilbilgisini Türkçe açıkla: "${sentence}"`;
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
            extractionList.innerHTML = '';
            
            words.forEach(item => {
                const row = document.createElement('div'); row.className = 'extracted-row';
                const safeData = encodeURIComponent(JSON.stringify({
                    id: Date.now() + Math.floor(Math.random()*1000), lang: studyLang, frontWord: item.word, pos: item.pos,
                    regularity: item.details, example: item.example || sentence, backTranslation: item.translation, backExample: item.example_tr || "-"
                }));

                row.innerHTML = `
                    <input type="checkbox" class="extracted-checkbox" value="${safeData}">
                    <div class="extracted-info">
                        <span class="ext-word">${item.word} <span class="ext-trans">- ${item.translation}</span></span>
                        <span class="ext-details">${item.pos} | ${item.details}</span>
                    </div>
                `;
                row.addEventListener('click', (e) => {
                    if(e.target.type !== 'checkbox') { const cb = row.querySelector('.extracted-checkbox'); cb.checked = !cb.checked; }
                });
                extractionList.appendChild(row);
            });
            document.getElementById('btn-save-extracted').classList.remove('hidden');
        } catch (e) { extractionList.innerHTML = "Analiz formatı hatalı."; }
    }

    document.getElementById('btn-save-extracted').addEventListener('click', () => {
        const checkboxes = document.querySelectorAll('.extracted-checkbox:checked');
        if (checkboxes.length === 0) { alert("En az bir kelime seçin."); return; }
        
        let addedCount = 0;
        checkboxes.forEach(cb => {
            const cardData = JSON.parse(decodeURIComponent(cb.value));
            if(!vault.some(v => v.frontWord === cardData.frontWord)) { vault.unshift(cardData); addedCount++; }
        });

        if(addedCount > 0) {
            localStorage.setItem('myVault', JSON.stringify(vault)); sessionVault = [...vault]; 
            renderVaultList(); renderFlashcard(); alert(`${addedCount} kelime eklendi!`);
            document.getElementById('close-drawer').click(); 
        } else { alert("Kelimeler havuzda mevcut."); }
    });

    document.getElementById('btn-drawer-send').addEventListener('click', async () => {
        const inputEl = document.getElementById('drawer-chat-input'); const question = inputEl.value.trim();
        if (!question) return;
        addChatMessage(question, 'user'); inputEl.value = '';

        const prompt = `Cümle: "${currentDrawerContext}". Soru: "${question}". Kısa cevap ver.`;
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

    // --- FLASHCARD (SWIPE VE CAMSILIK) ---
    document.getElementById('btn-random-session').addEventListener('click', () => {
        if (vault.length === 0) { alert("Havuz boş!"); return; }
        let shuffled = [...vault].sort(() => 0.5 - Math.random());
        sessionVault = shuffled.slice(0, 20);
        currentCardIndex = 0; renderFlashcard(); alert(`Rastgele oturum başladı!`);
    });

    function renderFlashcard() {
        const container = document.getElementById('flashcard-container');
        const controls = document.getElementById('flashcard-controls');
        
        if (sessionVault.length === 0) {
            container.innerHTML = '<div class="empty-vault-msg">Havuz boş.</div>'; controls.classList.add('hidden'); return;
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
                    <div class="fc-hint">Çeviri için dokun <i class="fa-solid fa-rotate"></i> <span>(Sağa sola kaydır)</span></div>
                </div>
                <div class="card-face card-back">
                    <div class="fc-word">${cardData.backTranslation || ""}</div>
                    <div class="fc-type">Türkçe Karşılığı</div>
                    <div class="fc-example">"${cardData.backExample || "-"}"</div>
                </div>
            </div>
        `;
    }

    document.getElementById('btn-prev-card').addEventListener('click', () => { if (currentCardIndex > 0) { currentCardIndex--; renderFlashcard(); } });
    document.getElementById('btn-next-card').addEventListener('click', () => { if (currentCardIndex < sessionVault.length - 1) { currentCardIndex++; renderFlashcard(); } });

    // Kartları Kaydırma (Swipe) Olayı
    let touchstartX = 0; let touchendX = 0;
    const fcContainer = document.getElementById('flashcard-container');
    fcContainer.addEventListener('touchstart', e => { touchstartX = e.changedTouches[0].screenX; }, {passive: true});
    fcContainer.addEventListener('touchend', e => {
        touchendX = e.changedTouches[0].screenX;
        if (touchendX < touchstartX - 50) document.getElementById('btn-next-card').click(); // Sola kaydır (İleri)
        if (touchendX > touchstartX + 50) document.getElementById('btn-prev-card').click(); // Sağa kaydır (Geri)
    }, {passive: true});

    function renderVaultList() {
        const list = document.getElementById('vault-list'); if(!list) return;
        list.innerHTML = vault.length === 0 ? '<p>Havuz boş.</p>' : '';
        vault.forEach(item => {
            const card = document.createElement('div'); card.className = 'word-card';
            card.innerHTML = `<div><small>${item.lang}</small><div><strong>${item.frontWord}</strong></div></div>
                              <button class="mini-btn" onclick="deleteWord(${item.id})"><i class="fa-solid fa-trash"></i></button>`;
            list.appendChild(card);
        });
    }

    window.deleteWord = (id) => {
        vault = vault.filter(v => v.id !== id); sessionVault = sessionVault.filter(v => v.id !== id);
        localStorage.setItem('myVault', JSON.stringify(vault));
        if(currentCardIndex >= sessionVault.length) currentCardIndex = Math.max(0, sessionVault.length - 1);
        renderVaultList(); renderFlashcard();
    };
    
    document.getElementById('btn-clear-all').addEventListener('click', () => {
        if(confirm("Tümünü silmek istediğine emin misin?")) {
            vault = []; sessionVault = []; localStorage.setItem('myVault', JSON.stringify(vault));
            currentCardIndex = 0; renderVaultList(); renderFlashcard();
        }
    });

    document.getElementById('btn-export-vault').addEventListener('click', () => {
        if(vault.length === 0) { alert("Havuz boş!"); return; }
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(vault));
        const dlAnchorElem = document.createElement('a'); dlAnchorElem.setAttribute("href", dataStr); dlAnchorElem.setAttribute("download", "dil_ai_yedek.json"); dlAnchorElem.click();
    });

    document.getElementById('import-vault').addEventListener('change', (event) => {
        const file = event.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                if(Array.isArray(importedData)) {
                    vault = importedData; sessionVault = [...vault]; localStorage.setItem('myVault', JSON.stringify(vault));
                    currentCardIndex = 0; alert("Yedek yüklendi!"); renderVaultList(); renderFlashcard();
                }
            } catch(err) { alert("Hata."); }
        };
        reader.readAsText(file);
    });

});
