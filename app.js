document.addEventListener('DOMContentLoaded', () => {
    
    // -- TEMA SİSTEMİ --
    const themeSelect = document.getElementById('theme-select');
    let savedTheme = localStorage.getItem('dil_theme_class') || "";
    if (savedTheme) { document.body.classList.add(savedTheme); themeSelect.value = savedTheme; }

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
    let chatHistoryVault = JSON.parse(localStorage.getItem('dil_chat_history')) || {}; 

    let currentDrawerContext = ""; 
    let currentDrawerAction = ""; 
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
        
        if (target === 'tab-vocab') { 
            document.querySelector('[data-sub="sub-kelimeler"]').click(); 
            renderVaultList(); renderFlashcard(); 
        }
    }));

    const subNavBtns = document.querySelectorAll('.sub-nav-btn');
    const subSections = document.querySelectorAll('.sub-section');
    subNavBtns.forEach(btn => btn.addEventListener('click', () => {
        subNavBtns.forEach(b => b.classList.remove('active'));
        subSections.forEach(s => s.classList.add('hidden'));
        btn.classList.add('active');
        document.getElementById(btn.getAttribute('data-sub')).classList.remove('hidden');
    }));

    // --- AYARLAR VE GELİŞMİŞ HAFIZA SİLİCİ ---
    document.getElementById('btn-save-key').addEventListener('click', () => {
        const keysInput = document.getElementById('api-key-input').value.trim();
        if (keysInput) { 
            localStorage.setItem('gemini_api_keys', keysInput); 
            API_KEYS = keysInput.split(',').map(k => k.trim()).filter(k => k !== "");
            currentKeyIndex = 0; alert(`${API_KEYS.length} adet API Anahtarı sisteme kaydedildi!`); 
        }
    });
    if (rawKeys) document.getElementById('api-key-input').value = rawKeys;

    document.getElementById('native-language').addEventListener('change', (e) => { nativeLang = e.target.value; localStorage.setItem('nativeLang', nativeLang); });
    document.getElementById('study-language').addEventListener('change', (e) => { studyLang = e.target.value; localStorage.setItem('studyLang', studyLang); });
    
    document.getElementById('btn-open-delete-modal').addEventListener('click', () => {
        document.getElementById('delete-modal').classList.remove('hidden');
    });
    document.getElementById('btn-cancel-del').addEventListener('click', () => {
        document.getElementById('delete-modal').classList.add('hidden');
    });

    document.getElementById('btn-confirm-del').addEventListener('click', () => {
        const delCache = document.getElementById('chk-del-cache').checked;
        const delChat = document.getElementById('chk-del-chat').checked;
        const delStories = document.getElementById('chk-del-stories').checked;
        const delVault = document.getElementById('chk-del-vault').checked;

        if (!delCache && !delChat && !delStories && !delVault) {
            alert("Lütfen silmek için listeden en az bir öğe seçin."); return;
        }

        if(confirm("Seçtiğin veriler tamamen silinecek ve bu işlem GERİ ALINAMAZ. Emin misin?")) {
            if (delCache) { aiCache = {}; localStorage.setItem('dil_ai_cache', JSON.stringify(aiCache)); }
            if (delChat) { chatHistoryVault = {}; localStorage.setItem('dil_chat_history', JSON.stringify(chatHistoryVault)); }
            if (delStories) { storyVault = []; localStorage.setItem('myStories', JSON.stringify(storyVault)); renderStoryList(); }
            if (delVault) { vault = []; sessionVault = []; localStorage.setItem('myVault', JSON.stringify(vault)); currentCardIndex = 0; renderVaultList(); renderFlashcard(); }
            
            alert("Seçilen veriler cihazınızdan başarıyla silindi!");
            document.getElementById('delete-modal').classList.add('hidden');
            
            document.getElementById('chk-del-cache').checked = false;
            document.getElementById('chk-del-chat').checked = false;
            document.getElementById('chk-del-stories').checked = false;
            document.getElementById('chk-del-vault').checked = false;
        }
    });

    // --- TTS (SESLENDİRME) YARDIMCISI ---
    window.playAudio = (text, languageName) => {
        if(!text) return;
        const ut = new SpeechSynthesisUtterance(text);
        let langCode = 'de-DE'; 
        if(languageName === 'İngilizce') langCode = 'en-US';
        else if(languageName === 'İspanyolca') langCode = 'es-ES';
        else if(languageName === 'Fransızca') langCode = 'fr-FR';
        ut.lang = langCode;
        speechSynthesis.speak(ut);
    };

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
                const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
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
        const prompt = `Lütfen "${input}" konusunda, ${studyLang} dilinde A1-A2 seviyesinde ${count} adet farklı kısa hikaye yaz. SADECE JSON formatında bir dizi döndür. Format: [{"title": "Hikaye Başlığı", "content": "Hikaye metni..."}]`;

        const responseText = await callGemini(null, prompt, true);
        btn.innerText = "Hikaye Üret"; btn.disabled = false;

        if (!responseText) { alert("Hikaye üretilemedi."); return; }
        try {
            const stories = JSON.parse(responseText);
            stories.forEach(story => {
                storyVault.unshift({ id: Date.now() + Math.floor(Math.random() * 1000), title: story.title, content: story.content, lang: studyLang, prompt: input });
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
            div.innerHTML = `
                <div class="story-header" onclick="toggleStory(${story.id})">
                    <div class="story-item-title"><i class="fa-solid fa-book"></i> ${story.title}</div>
                    <div>
                        <button class="mini-btn" style="background:transparent; color:var(--secondary-color);" onclick="event.stopPropagation(); showPrompt('${story.prompt || "Bilgi yok."}')"><i class="fa-solid fa-circle-question"></i></button>
                        <button class="mini-btn" style="background:transparent; color:#cf6679;" onclick="event.stopPropagation(); deleteStory(${story.id})"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>
                <div class="story-content-box hidden" id="story-content-${story.id}">
                    <p style="margin-bottom: 15px;">${story.content}</p>
                    <button class="action-btn mini" style="width:100%;" onclick="sendToLab(${story.id})"><i class="fa-solid fa-flask"></i> Laboratuvara Aktar</button>
                </div>
            `;
            listContainer.appendChild(div);
        });
    }

    window.toggleStory = (id) => {
        const contentBox = document.getElementById(`story-content-${id}`);
        if (contentBox.classList.contains('hidden')) {
            document.querySelectorAll('.story-content-box').forEach(el => el.classList.add('hidden')); 
            contentBox.classList.remove('hidden');
            history.pushState({ storyOpen: id }, ""); 
        } else {
            contentBox.classList.add('hidden');
        }
    };

    window.sendToLab = (id) => {
        const story = storyVault.find(s => s.id === id);
        if(story) {
            document.querySelector('[data-target="tab-lab"]').click();
            prepareLabText(story.content);
        }
    };

    window.showPrompt = (promptText) => { alert("Bu hikaye şu komutla oluşturuldu:\n\n" + promptText); };
    window.deleteStory = (id) => { if(confirm("Hikayeyi silmek istediğine emin misin?")) { storyVault = storyVault.filter(s => s.id !== id); localStorage.setItem('myStories', JSON.stringify(storyVault)); renderStoryList(); } };

    // --- LAB: CÜMLE ANALİZİ ---
    async function prepareLabText(text, isRestore = false) {
        sessionStorage.setItem('activeLabText', text);
        currentStoryAnalysisData = {}; 
        const labContainer = document.getElementById('text-container');
        labContainer.innerHTML = '';
        
        const topActionsDiv = document.createElement('div');
        topActionsDiv.style.marginBottom = "25px";
        topActionsDiv.style.textAlign = "center";
        
        const btnExtractAll = document.createElement('button');
        btnExtractAll.className = 'action-btn';
        btnExtractAll.style.width = "100%";
        btnExtractAll.style.padding = "15px";
        btnExtractAll.innerHTML = '<i class="fa-solid fa-list-check"></i> Tüm Hikayedeki Kelimeleri Ayıkla';
        btnExtractAll.addEventListener('click', () => openDrawer(text, 'extract-all'));
        
        topActionsDiv.appendChild(btnExtractAll);
        labContainer.appendChild(topActionsDiv);

        const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

        sentences.forEach((sentText) => {
            const cleanSent = sentText.trim();
            const block = document.createElement('div'); block.className = 'sentence-block';
            
            const textSpan = document.createElement('span'); textSpan.className = 'sentence-text'; textSpan.innerText = cleanSent;
            block.appendChild(textSpan);

            const actionsDiv = document.createElement('div'); actionsDiv.className = 'sentence-actions';
            
            const btnTTS = document.createElement('button'); btnTTS.className = 'btn-action-sm action-tts'; btnTTS.innerHTML = '<i class="fa-solid fa-volume-high"></i> Dinle';
            btnTTS.addEventListener('click', () => playAudio(cleanSent, studyLang));

            const btnTrans = document.createElement('button'); btnTrans.className = 'btn-action-sm'; btnTrans.innerHTML = '<i class="fa-solid fa-language"></i> Çevir';
            btnTrans.addEventListener('click', () => openDrawer(cleanSent, 'translate'));
            
            const btnGrammar = document.createElement('button'); btnGrammar.className = 'btn-action-sm'; btnGrammar.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> İncele';
            btnGrammar.addEventListener('click', () => openDrawer(cleanSent, 'grammar'));

            const btnExtract = document.createElement('button'); btnExtract.className = 'btn-action-sm extract'; btnExtract.innerHTML = '<i class="fa-solid fa-list-check"></i> Ayıkla';
            btnExtract.addEventListener('click', () => openDrawer(cleanSent, 'extract'));

            actionsDiv.appendChild(btnTTS); actionsDiv.appendChild(btnTrans); actionsDiv.appendChild(btnGrammar); actionsDiv.appendChild(btnExtract);
            block.appendChild(actionsDiv); labContainer.appendChild(block);
        });

        if (!isRestore && API_KEYS.length > 0) { autoAnalyzeFullStory(text); }
    }

    // ÖĞRETMEN MODU VE BİÇİMLENDİRME: TOPLU ANALİZ MOTORU
    async function autoAnalyzeFullStory(fullText) {
        const buttons = document.querySelectorAll('.sentence-actions button');
        buttons.forEach(b => { b.disabled = true; });
        
        const statusBadge = document.getElementById('analysis-status');
        statusBadge.classList.remove('hidden', 'success');
        statusBadge.innerHTML = '<i class="fa-solid fa-spinner"></i> <span>Yapay Zeka Metni Analiz Ediyor... Lütfen bekleyiniz.</span>';

        const cacheKey = `full_analysis_${studyLang}_${fullText.substring(0,30)}`;
        
        const prompt = `Şu ${studyLang} dilindeki metnin İÇİNDEKİ HER BİR CÜMLEYİ ayrı ayrı analiz et: "${fullText}". 
        SADECE JSON formatında bir dizi (array) döndür. 
        DİKKAT (HTML KULLAN): 'grammar' ve 'details' alanlarında metni <b>, <ul>, <li> ve <br> gibi HTML etiketleriyle MADDELER HALİNDE ve kalın yazılarla şık biçimde organize et. JSON bozulmaması için özelliklere style vb. yazarken SADECE TEK TIRNAK kullan.
        Format şu şekilde olmalı: 
        [
          {
            "sentence": "Cümlenin orijinal tam hali",
            "translation": "Cümlenin ${nativeLang} çevirisi",
            "grammar": "ÖĞRETMEN GİBİ ÇOK DETAYLI ANALİZ (HTML formatlı, maddeli): Cümleyi yeni başlayan öğrenci için açıkla. Fiil varsa zamanını ve tüm zamirlere göre çekimini yaz. İsimlerin artikellerini (der/die/das) KESİNLİKLE belirt. Edat varsa durumunu açıkla.",
            "words": [ {"word": "İsimse KESİNLİKLE ARTIKELİYLE (örn: der Tisch). Fiilse mastar hali.", "translation": "Türkçesi", "pos": "isim/fiil/edat vs.", "details": "ÇOK DETAYLI (HTML Formatlı, maddeli): İsimse çoğul hali ve Dat/Akk durumu. Fiilse tüm kişi zamirlerine göre çekimleri ve geçmiş zamanı. Edatsa case kuralı. Modal ise kullanımı.", "example": "Kelimenin geçtiği örnek cümle", "example_tr": "Örnek cümlenin Türkçe çevirisi"} ]
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
            } catch (e) { statusBadge.classList.add('hidden'); }
        } else { statusBadge.classList.add('hidden'); }

        buttons.forEach(b => { b.disabled = false; });
    }

    const savedLabText = sessionStorage.getItem('activeLabText');
    if (savedLabText) prepareLabText(savedLabText, true); 

    // --- AI ÇEKMECESİ VE GERİ TUŞU KONTROLÜ ---
    const drawer = document.getElementById('ai-drawer');
    const chatContainer = document.getElementById('chat-container');
    const extractionContainer = document.getElementById('extraction-container');
    const chatContent = document.getElementById('ai-response-content');
    const extractionList = document.getElementById('extraction-list');
    
    window.addEventListener('popstate', (e) => {
        if (!drawer.classList.contains('hidden')) {
            drawer.classList.add('hidden'); 
        } else {
            document.querySelectorAll('.story-content-box').forEach(el => el.classList.add('hidden'));
        }
    });

    async function openDrawer(sentence, action) {
        currentDrawerContext = sentence;
        currentDrawerAction = action; 
        
        if (drawer.classList.contains('hidden')) {
            history.pushState({ drawerOpen: true }, "");
            drawer.classList.remove('hidden');
        }

        const preData = currentStoryAnalysisData[sentence];
        const hasPreData = preData !== undefined;

        document.getElementById('drawer-title').innerText = action === 'extract-all' ? "Tüm Hikaye Analizi" : sentence;

        if (action === 'extract' || action === 'extract-all') {
            document.getElementById('drawer-action-name').innerText = action === 'extract-all' ? "Tüm Hikayedeki Kelimeler Ayıklanıyor" : "Kelimeler Ayıklanıyor";
            chatContainer.classList.add('hidden'); extractionContainer.classList.remove('hidden');
            document.getElementById('btn-save-extracted').classList.add('hidden'); 
            
            if (action === 'extract-all') {
                extractionList.innerHTML = "<div style='padding:20px; text-align:center;'>Tüm hikaye derinlemesine analiz ediliyor (Metnin uzunluğuna göre bu işlem biraz sürebilir), lütfen bekleyin...</div>";
                const cacheKey = `extract_all_${studyLang}_${sentence.substring(0,40)}`;
                const prompt = `Şu ${studyLang} dilindeki TÜM METİNDE geçen BÜTÜN YENİ VE ÖNEMLİ KELİMELERİ yeni başlayan biri için DETAYLI analiz et: "${sentence}".
                SADECE JSON dizisi döndür. 
                'details' alanında veriyi <b>, <ul>, <li>, <br> HTML etiketleriyle maddeler halinde, kalın vurgularla BİÇİMLENDİR.
                Format: [{"word": "İsimse ARTIKELİYLE, Fiilse mastar", "translation": "Türkçesi", "pos": "isim/fiil vs.", "details": "HTML Biçimli Detaylı Çekimler", "example": "Metinden Örnek", "example_tr": "Örnek çevirisi"}]`;
                const response = await callGemini(cacheKey, prompt, true);
                renderExtractionList(response, sentence);
            }
            else if (hasPreData && preData.words) {
                renderExtractionList(JSON.stringify(preData.words), sentence);
            } else {
                extractionList.innerHTML = "<div style='padding:20px; text-align:center;'>Derin analiz yapılıyor, lütfen bekleyin...</div>";
                const cacheKey = `extract_${studyLang}_${sentence.substring(0,30)}`;
                const prompt = `Şu ${studyLang} cümlesindeki tüm kelimeleri yeni başlayan biri için DETAYLI analiz et: "${sentence}".
                SADECE JSON dizisi döndür. 'details' alanında veriyi HTML etiketleriyle BİÇİMLENDİR.
                Format: [{"word": "İsimse ARTIKELİYLE, Fiilse mastar", "translation": "Türkçesi", "pos": "isim/fiil vs.", "details": "HTML Biçimli", "example": "Örnek", "example_tr": "Çevirisi"}]`;
                const response = await callGemini(cacheKey, prompt, true);
                renderExtractionList(response, sentence);
            }
        } else {
            extractionContainer.classList.add('hidden'); chatContainer.classList.remove('hidden'); chatContent.innerHTML = ''; 
            
            let mainResponseAdded = false;

            if (action === 'translate') {
                document.getElementById('drawer-action-name').innerText = "Cümle Çevirisi";
                if (hasPreData && preData.translation) { addChatMessage(preData.translation, 'ai'); mainResponseAdded = true; }
            } else {
                document.getElementById('drawer-action-name').innerText = "Gramer Analizi";
                if (hasPreData && preData.grammar) { addChatMessage(preData.grammar, 'ai'); mainResponseAdded = true; }
            }
            
            if (!mainResponseAdded) {
                let prompt = ""; let cacheKey = "";
                if (action === 'translate') {
                    cacheKey = `trans_${studyLang}_${sentence.substring(0,30)}`; prompt = `Şu ${studyLang} cümlesini ${nativeLang} diline çevir: "${sentence}"`;
                } else {
                    cacheKey = `gram_${studyLang}_${sentence.substring(0,30)}`; prompt = `Şu cümlenin dilbilgisini yeni başlayan bir öğrenci için ÇOK DETAYLI Türkçe açıkla. Fiil varsa zamanını ve tüm zamirlere göre çekimini yaz. İsimlerin artikellerini belirt. Edat varsa durumunu açıkla. 
                    CEVABI HTML FORMATINDA VER: <b>, <ul>, <li>, <br> kullanarak cevabını çok şık, maddeler halinde ve kolay okunabilir şekilde biçimlendir. Düz metin YAZMA: "${sentence}"`;
                }
                
                addChatMessage("Öğretmen analiz ediyor...", 'ai');
                const response = await callGemini(cacheKey, prompt, false);
                chatContent.innerHTML = ''; addChatMessage(response || "Hata oluştu.", 'ai');
            }

            if (chatHistoryVault[sentence] && chatHistoryVault[sentence][action]) {
                chatHistoryVault[sentence][action].forEach(chat => {
                    addChatMessage(chat.q, 'user'); addChatMessage(chat.a, 'ai');
                });
            }
        }
    }

    document.getElementById('close-drawer').addEventListener('click', () => { 
        if (!drawer.classList.contains('hidden')) {
            drawer.classList.add('hidden'); 
            if (history.state && history.state.drawerOpen) { history.back(); }
        }
    });

    function renderExtractionList(jsonString, contextText) {
        if (!jsonString) { extractionList.innerHTML = "Veri çekilemedi."; return; }
        try {
            const words = JSON.parse(jsonString);
            extractionList.innerHTML = '';
            
            words.forEach(item => {
                const row = document.createElement('div'); row.className = 'extracted-row';
                const safeExample = item.example || (contextText.length > 100 ? "Metinden örnek" : contextText);

                const safeData = encodeURIComponent(JSON.stringify({
                    id: Date.now() + Math.floor(Math.random()*1000), lang: studyLang, frontWord: item.word, pos: item.pos,
                    regularity: item.details, example: safeExample, backTranslation: item.translation, backExample: item.example_tr || "-"
                }));

                row.innerHTML = `
                    <input type="checkbox" class="extracted-checkbox" value="${safeData}">
                    <div class="extracted-info">
                        <div><span class="ext-word">${item.word}</span> <span class="ext-trans">- ${item.translation}</span></div>
                        <span class="ext-pos">${item.pos}</span>
                        <div class="ext-details-box">${item.details}</div>
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

        const prompt = `Cümle: "${currentDrawerContext}". Soru: "${question}". Yeni başlayan öğrenciye açıklar gibi cevap ver. Cevabı HTML etiketleri (<b>, <ul> vb.) kullanarak çok şık ve maddeli biçimlendir.`;
        const loadingDiv = document.createElement('div'); loadingDiv.className = 'chat-msg chat-ai'; loadingDiv.innerText = "...";
        chatContent.appendChild(loadingDiv); chatContent.scrollTop = chatContent.scrollHeight;

        const answer = await callGemini(null, prompt, false); 
        loadingDiv.remove(); addChatMessage(answer || "Yanıt alınamadı.", 'ai');

        if (answer) {
            if (!chatHistoryVault[currentDrawerContext]) chatHistoryVault[currentDrawerContext] = {};
            if (!chatHistoryVault[currentDrawerContext][currentDrawerAction]) chatHistoryVault[currentDrawerContext][currentDrawerAction] = [];
            
            chatHistoryVault[currentDrawerContext][currentDrawerAction].push({ q: question, a: answer });
            localStorage.setItem('dil_chat_history', JSON.stringify(chatHistoryVault));
        }
    });

    function addChatMessage(text, sender) {
        const msgDiv = document.createElement('div'); msgDiv.className = `chat-msg chat-${sender}`;
        msgDiv.innerHTML = text; 
        chatContent.appendChild(msgDiv); chatContent.scrollTop = chatContent.scrollHeight;
    }

    // --- FLASHCARD & LİSTE ---
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
                    <button class="tts-icon" onclick="event.stopPropagation(); playAudio('${cardData.frontWord}', '${cardData.lang}')"><i class="fa-solid fa-volume-high"></i></button>
                    <div class="fc-word">${cardData.frontWord || "Hata"}</div>
                    <div class="fc-type">${cardData.pos || "Kelime Türü Belirsiz"}</div>
                    <div class="fc-example">"${cardData.example || ""}"</div>
                    <div class="fc-hint">Çeviri ve Detaylar İçin Dokun <i class="fa-solid fa-rotate"></i> <span>(Sağa sola kaydır)</span></div>
                </div>
                <div class="card-face card-back">
                    <div class="fc-word">${cardData.backTranslation || ""}</div>
                    <div class="fc-details" onclick="event.stopPropagation();">${cardData.regularity || "Ekstra detay bulunmuyor."}</div>
                    <div class="fc-example">"${cardData.backExample || "-"}"</div>
                </div>
            </div>
        `;
    }

    document.getElementById('btn-prev-card').addEventListener('click', () => { if (currentCardIndex > 0) { currentCardIndex--; renderFlashcard(); } });
    document.getElementById('btn-next-card').addEventListener('click', () => { if (currentCardIndex < sessionVault.length - 1) { currentCardIndex++; renderFlashcard(); } });

    let touchstartX = 0; let touchendX = 0;
    const vocabTab = document.getElementById('tab-vocab');
    vocabTab.addEventListener('touchstart', e => { touchstartX = e.changedTouches[0].screenX; }, {passive: true});
    
    vocabTab.addEventListener('touchend', e => {
        touchendX = e.changedTouches[0].screenX;
        let isInsideCard = e.target.closest('.flashcard-container'); 
        
        if (touchendX < touchstartX - 60) {
            if (isInsideCard) document.getElementById('btn-next-card').click();
            else document.querySelector('[data-sub="sub-liste"]').click(); 
        }
        if (touchendX > touchstartX + 60) {
            if (isInsideCard) document.getElementById('btn-prev-card').click();
            else document.querySelector('[data-sub="sub-kelimeler"]').click(); 
        }
    }, {passive: true});

    function renderVaultList() {
        const list = document.getElementById('vault-list'); if(!list) return;
        list.innerHTML = vault.length === 0 ? '<p>Havuz boş.</p>' : '';
        vault.forEach(item => {
            const card = document.createElement('div'); card.className = 'word-card';
            card.innerHTML = `<div><small>${item.lang}</small><div><strong>${item.frontWord}</strong></div></div>
                              <button class="mini-btn" style="background:transparent; color:#cf6679; border:1px solid #cf6679;" onclick="deleteWord(${item.id})"><i class="fa-solid fa-trash"></i></button>`;
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

    // --- TÜM VERİLERİ (FULL BACKUP) İNDİR VE YÜKLE ---
    document.getElementById('btn-export-vault').addEventListener('click', () => {
        const fullBackup = {
            vault: vault,
            storyVault: storyVault,
            aiCache: aiCache,
            chatHistoryVault: chatHistoryVault,
            settings: {
                apiKeys: localStorage.getItem('gemini_api_keys') || "",
                nativeLang: nativeLang,
                studyLang: studyLang,
                theme: localStorage.getItem('dil_theme_class') || ""
            }
        };
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(fullBackup));
        const dlAnchorElem = document.createElement('a'); 
        dlAnchorElem.setAttribute("href", dataStr); 
        dlAnchorElem.setAttribute("download", "dil_ai_tam_yedek.json"); 
        dlAnchorElem.click();
    });

    document.getElementById('import-vault').addEventListener('change', (event) => {
        const file = event.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                
                if (Array.isArray(importedData)) {
                    // Sadece eski tip kelime yedeği
                    vault = importedData; sessionVault = [...vault]; localStorage.setItem('myVault', JSON.stringify(vault));
                    currentCardIndex = 0; alert("Eski tip kelime yedeği yüklendi!"); renderVaultList(); renderFlashcard();
                } else if (importedData.vault !== undefined) {
                    // Yeni tip TAM YEDEK
                    if(confirm("Bu işlem mevcut tüm hikaye, kelime ve sohbetlerini silecek ve yedekteki verileri yükleyecek. Emin misin?")) {
                        localStorage.setItem('myVault', JSON.stringify(importedData.vault || []));
                        localStorage.setItem('myStories', JSON.stringify(importedData.storyVault || []));
                        localStorage.setItem('dil_ai_cache', JSON.stringify(importedData.aiCache || {}));
                        localStorage.setItem('dil_chat_history', JSON.stringify(importedData.chatHistoryVault || {}));
                        
                        if (importedData.settings) {
                            localStorage.setItem('gemini_api_keys', importedData.settings.apiKeys || "");
                            localStorage.setItem('nativeLang', importedData.settings.nativeLang || "Türkçe");
                            localStorage.setItem('studyLang', importedData.settings.studyLang || "Almanca");
                            localStorage.setItem('dil_theme_class', importedData.settings.theme || "");
                        }
                        
                        alert("Tüm veriler başarıyla geri yüklendi! Uygulama yenileniyor...");
                        location.reload(); 
                    }
                } else {
                    alert("Geçersiz yedek dosyası!");
                }
            } catch(err) { alert("Dosya okuma hatası."); }
        };
        reader.readAsText(file);
    });

});
