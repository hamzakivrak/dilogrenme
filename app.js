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
    let notesVault = JSON.parse(localStorage.getItem('dil_notes')) || []; 
    let studySessionsVault = JSON.parse(localStorage.getItem('dil_study_sessions')) || []; 
    
    let sessionVault = []; 
    let studyPhase = 'none'; 
    let currentCardIndex = 0;
    
    let draftSessionCards = []; 
    
    let quizQueue = []; 
    let currentQuizIndex = 0;
    let quizScore = 0;

    let aiCache = JSON.parse(localStorage.getItem('dil_ai_cache')) || {}; 
    let chatHistoryVault = JSON.parse(localStorage.getItem('dil_chat_history')) || {}; 

    let currentDrawerContext = ""; 
    let currentDrawerAction = ""; 
    let currentStoryAnalysisData = {}; 
    let pendingNoteContent = ""; 

    if (document.getElementById('native-language')) document.getElementById('native-language').value = nativeLang;
    if (document.getElementById('study-language')) document.getElementById('study-language').value = studyLang;

    // YENİ PROMPT KURALI (HTML zorlamasını kaldırdık, yapay zeka serbestçe Markdown tablo yapabilir, biz çevireceğiz)
    const STRICT_PROMPT_RULE = " Gereksiz selamlama, giriş veya kapanış cümleleri KESİNLİKLE KULLANMA. Doğrudan konuya gir, net ve öz ol ama tüm detayları ver.";

    renderStoryList();
    renderNotesList();

    // --- YENİ EKLENEN: MARKDOWN TO HTML PARSER (TABLO ÇÖZÜCÜ) ---
    function formatTextToHTML(text) {
        if (!text) return "";
        let html = text;

        // 1. Markdown Tablolarını Çevirme
        const tableRegex = /\|(.+)\|\n\|([-:| ]+)\|\n((\|.*\|\n?)+)/g;
        html = html.replace(tableRegex, (match, header, separator, body) => {
            const parseRow = (rowStr) => {
                let content = rowStr.trim();
                if (content.startsWith('|')) content = content.substring(1);
                if (content.endsWith('|')) content = content.substring(0, content.length - 1);
                return content.split('|').map(c => c.trim());
            };

            const ths = parseRow(header).map(c => `<th>${c}</th>`).join('');
            const trs = body.trim().split('\n').map(row => {
                if (!row.trim()) return '';
                const tds = parseRow(row).map(c => `<td>${c}</td>`).join('');
                return `<tr>${tds}</tr>`;
            }).join('');

            // Tabloları geçici bir etiketle sarıyoruz ki sonraki <br> işlemi tabloyu bozmasın
            return `__TABLE_START__<div class="table-responsive"><table class="ai-table"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>__TABLE_END__`;
        });

        // 2. Bold (**) ve İtalik (*) Çevirisi
        html = html.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
        html = html.replace(/(?<!\w)\*(.*?)\*(?!\w)/g, '<i>$1</i>'); 

        // 3. Alt satıra geçişleri <br> yap (Tabloların dışındaki alanlarda)
        const parts = html.split(/__TABLE_START__|__TABLE_END__/);
        for (let i = 0; i < parts.length; i++) {
            if (i % 2 === 0) { // Sadece tablo dışı metinlerde \n -> <br> yap
                parts[i] = parts[i].replace(/\n/g, '<br>');
            }
        }
        return parts.join('');
    }

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
            checkFlashcardState();
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

    // --- REHBER MODALI ---
    document.getElementById('btn-open-guide').addEventListener('click', () => { document.getElementById('guide-modal').classList.remove('hidden'); });
    document.getElementById('btn-close-guide').addEventListener('click', () => { document.getElementById('guide-modal').classList.add('hidden'); });

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
    
    document.getElementById('btn-open-delete-modal').addEventListener('click', () => { document.getElementById('delete-modal').classList.remove('hidden'); });
    document.getElementById('btn-cancel-del').addEventListener('click', () => { document.getElementById('delete-modal').classList.add('hidden'); });

    document.getElementById('btn-confirm-del').addEventListener('click', () => {
        const delCache = document.getElementById('chk-del-cache').checked;
        const delChat = document.getElementById('chk-del-chat').checked;
        const delStories = document.getElementById('chk-del-stories').checked;
        const delVault = document.getElementById('chk-del-vault').checked;
        const delNotes = document.getElementById('chk-del-notes').checked;
        const delSessions = document.getElementById('chk-del-sessions').checked;

        if (!delCache && !delChat && !delStories && !delVault && !delNotes && !delSessions) { alert("Lütfen silmek için listeden en az bir öğe seçin."); return; }

        if(confirm("Seçtiğin veriler tamamen silinecek ve bu işlem GERİ ALINAMAZ. Emin misin?")) {
            if (delCache) { aiCache = {}; localStorage.setItem('dil_ai_cache', JSON.stringify(aiCache)); }
            if (delChat) { chatHistoryVault = {}; localStorage.setItem('dil_chat_history', JSON.stringify(chatHistoryVault)); }
            if (delStories) { storyVault = []; localStorage.setItem('myStories', JSON.stringify(storyVault)); renderStoryList(); }
            if (delVault) { vault = []; sessionVault = []; localStorage.setItem('myVault', JSON.stringify(vault)); checkFlashcardState(); }
            if (delNotes) { notesVault = []; localStorage.setItem('dil_notes', JSON.stringify(notesVault)); renderNotesList(); }
            if (delSessions) { studySessionsVault = []; localStorage.setItem('dil_study_sessions', JSON.stringify(studySessionsVault)); }
            
            alert("Seçilen veriler cihazınızdan başarıyla silindi!");
            document.getElementById('delete-modal').classList.add('hidden');
            document.querySelectorAll('#delete-modal input[type="checkbox"]').forEach(chk => chk.checked = false);
        }
    });

    document.getElementById('chk-select-all').addEventListener('change', (e) => {
        const checkboxes = document.querySelectorAll('.extracted-checkbox');
        checkboxes.forEach(cb => { if(!cb.disabled) cb.checked = e.target.checked; });
    });

    function syncSelectAllCheckbox() {
        const allCheckboxes = document.querySelectorAll('.extracted-checkbox');
        const checkedBoxes = document.querySelectorAll('.extracted-checkbox:checked');
        const chkSelectAll = document.getElementById('chk-select-all');
        if (allCheckboxes.length > 0) chkSelectAll.checked = (allCheckboxes.length === checkedBoxes.length);
        else chkSelectAll.checked = false;
    }

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

    // --- OTOMATİK SEÇİM ÇEVİRİSİ (TOOLTIP) ---
    document.addEventListener('mouseup', async (e) => {
        const tooltip = document.getElementById('selection-tooltip');
        if (e.target.id === 'selection-tooltip' || e.target.closest('#selection-tooltip')) return; 
        
        const selection = window.getSelection().toString().trim();
        if (selection.length > 0 && selection.length < 60) {
            tooltip.innerText = "Çevriliyor...";
            tooltip.style.left = `${e.pageX}px`;
            tooltip.style.top = `${e.pageY - 35}px`;
            tooltip.classList.remove('hidden');
            
            const prompt = `Lütfen "${selection}" kelimesini/ifadesini ${nativeLang} diline çevir. Sadece karşılığını yaz, hiçbir ek açıklama veya noktalama işareti koyma.`;
            const trans = await callGemini(`sel_trans_${studyLang}_${selection}`, prompt, false);
            
            if (trans) {
                tooltip.innerHTML = `${trans} <i class="fa-solid fa-volume-high" style="margin-left:5px;"></i>`;
                tooltip.onclick = () => { playAudio(selection, studyLang); };
            } else {
                tooltip.classList.add('hidden');
            }
        } else {
            tooltip.classList.add('hidden');
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
                storyVault.unshift({ id: Date.now() + Math.floor(Math.random() * 1000), title: story.title, content: story.content, lang: studyLang, prompt: input, isWorked: false });
            });
            localStorage.setItem('myStories', JSON.stringify(storyVault));
            renderStoryList();
        } catch(e) { alert("JSON Hatası."); }
    });

    function renderStoryList() {
        const listContainer = document.getElementById('story-list-container');
        if (storyVault.length === 0) { listContainer.innerHTML = '<div class="empty-vault-msg">Henüz kayıtlı hikaye yok. Yukarıdan üretin.</div>'; return; }
        listContainer.innerHTML = '';
        storyVault.forEach(story => {
            const div = document.createElement('div'); 
            const workedClass = story.isWorked ? ' worked' : '';
            const workedIcon = story.isWorked ? '<i class="fa-solid fa-check-double" style="margin-right:5px; font-size:12px;"></i> ' : '';
            
            div.className = `story-item${workedClass}`;
            div.innerHTML = `
                <div class="story-header" onclick="toggleStory(${story.id})">
                    <div class="story-item-title"><i class="fa-solid fa-book"></i> ${workedIcon}${story.title}</div>
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
            story.isWorked = true; localStorage.setItem('myStories', JSON.stringify(storyVault)); renderStoryList(); 
            document.querySelector('[data-target="tab-lab"]').click(); prepareLabText(story.content);
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
        topActionsDiv.style.marginBottom = "25px"; topActionsDiv.style.textAlign = "center";
        
        const btnExtractAll = document.createElement('button');
        btnExtractAll.className = 'action-btn'; btnExtractAll.style.width = "100%"; btnExtractAll.style.padding = "15px";
        btnExtractAll.innerHTML = '<i class="fa-solid fa-list-check"></i> Tüm Hikayedeki Kelimeleri Ayıkla';
        btnExtractAll.addEventListener('click', () => openDrawer(text, 'extract-all'));
        
        topActionsDiv.appendChild(btnExtractAll); labContainer.appendChild(topActionsDiv);

        const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

        sentences.forEach((sentText) => {
            const cleanSent = sentText.trim();
            if(!cleanSent) return;
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

    async function autoAnalyzeFullStory(fullText) {
        const buttons = document.querySelectorAll('.sentence-actions button');
        buttons.forEach(b => { b.disabled = true; });
        
        const statusBadge = document.getElementById('analysis-status');
        statusBadge.classList.remove('hidden', 'success');
        statusBadge.innerHTML = '<i class="fa-solid fa-spinner"></i> <span>Yapay Zeka Metni Analiz Ediyor... Lütfen bekleyiniz.</span>';

        const cacheKey = `full_analysis_${studyLang}_${fullText.substring(0,30)}`;
        const prompt = `Şu ${studyLang} dilindeki metnin İÇİNDEKİ HER BİR CÜMLEYİ ayrı ayrı analiz et: "${fullText}". 
        SADECE JSON formatında bir dizi döndür. 
        DİKKAT: 'grammar' ve 'details' alanlarında metni maddeler halinde çok detaylı organize et. JSON bozulmaması için özelliklere style vb. yazarken SADECE TEK TIRNAK kullan.
        Format şu şekilde olmalı: 
        [
          {
            "sentence": "Orijinal cümle", "translation": "${nativeLang} çevirisi",
            "grammar": "ÖĞRETMEN GİBİ ÇOK DETAYLI ANALİZ.",
            "words": [ {"word": "İsimse ARTIKELİYLE. Fiilse mastar.", "translation": "Türkçesi", "pos": "isim/fiil/edat vs.", "details": "ÇOK DETAYLI.", "example": "Kelimenin geçtiği örnek cümle", "example_tr": "Örnek cümlenin Türkçe çevirisi"} ]
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
        if (!drawer.classList.contains('hidden')) { drawer.classList.add('hidden'); } 
        else {
            document.querySelectorAll('.story-content-box').forEach(el => el.classList.add('hidden'));
            document.querySelectorAll('.note-content-box').forEach(el => el.classList.add('hidden'));
            
            const modals = ['word-list-modal', 'session-prep-modal', 'past-sessions-modal', 'guide-modal'];
            modals.forEach(id => {
                const modal = document.getElementById(id);
                if (modal && !modal.classList.contains('hidden')) modal.classList.add('hidden');
            });
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
            document.getElementById('drawer-action-name').innerText = action === 'extract-all' ? "Tüm Hikayedeki Kelimeler" : "Kelimeler Ayıklanıyor";
            chatContainer.classList.add('hidden'); extractionContainer.classList.remove('hidden');
            
            document.getElementById('btn-save-extracted').classList.add('hidden'); 
            document.getElementById('extract-header-actions').classList.add('hidden');
            const chkSelectAll = document.getElementById('chk-select-all');
            if (chkSelectAll) chkSelectAll.checked = false;

            if (action === 'extract-all') {
                let allWords = []; let wordSet = new Set();
                for (const [sent, data] of Object.entries(currentStoryAnalysisData)) {
                    if (data && data.words) {
                        data.words.forEach(w => {
                            let key = w.word.toLowerCase().trim();
                            if (!wordSet.has(key)) { 
                                wordSet.add(key); let cloneW = {...w};
                                if (!cloneW.example) cloneW.example = sent;
                                allWords.push(cloneW);
                            }
                        });
                    }
                }
                if (allWords.length > 0) { renderExtractionList(JSON.stringify(allWords), "Tüm Hikaye"); } 
                else { extractionList.innerHTML = "<div style='padding:20px; text-align:center;'>Kelime bulunamadı veya analiz henüz tamamlanmadı. Lütfen sağ üstteki analizin bitmesini bekleyip tekrar deneyin.</div>"; }
            }
            else if (hasPreData && preData.words) { renderExtractionList(JSON.stringify(preData.words), sentence); } 
            else {
                extractionList.innerHTML = "<div style='padding:20px; text-align:center;'>Derin analiz yapılıyor, lütfen bekleyin...</div>";
                const cacheKey = `extract_${studyLang}_${sentence.substring(0,30)}`;
                const prompt = `Şu ${studyLang} cümlesindeki tüm kelimeleri yeni başlayan biri için DETAYLI analiz et: "${sentence}". SADECE JSON dizisi döndür. Format: [{"word": "İsimse ARTIKELİYLE, Fiilse mastar", "translation": "Türkçesi", "pos": "isim/fiil vs.", "details": "Açıklama", "example": "Örnek", "example_tr": "Çevirisi"}]`;
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
                    cacheKey = `trans_${studyLang}_${sentence.substring(0,30)}`; prompt = `Şu ${studyLang} cümlesini ${nativeLang} diline çevir: "${sentence}"` + STRICT_PROMPT_RULE;
                } else {
                    cacheKey = `gram_${studyLang}_${sentence.substring(0,30)}`; prompt = `Şu cümlenin dilbilgisini yeni başlayan bir öğrenci için ÇOK DETAYLI Türkçe açıkla. Fiil varsa zamanını ve tüm zamirlere göre çekimini yaz. İsimlerin artikellerini belirt. Edat varsa durumunu açıkla: "${sentence}"` + STRICT_PROMPT_RULE;
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
            
            if (words.length > 0) {
                document.getElementById('extract-header-actions').classList.remove('hidden');
                document.getElementById('btn-save-extracted').classList.remove('hidden');
            }
            
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
                    syncSelectAllCheckbox();
                });
                row.querySelector('.extracted-checkbox').addEventListener('change', () => { syncSelectAllCheckbox(); });

                extractionList.appendChild(row);
            });
            
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
            localStorage.setItem('myVault', JSON.stringify(vault)); 
            checkFlashcardState(); alert(`${addedCount} kelime eklendi!`);
            document.getElementById('close-drawer').click(); 
        } else { alert("Seçtiğin kelimeler havuzda mevcut."); }
    });

    document.getElementById('btn-drawer-send').addEventListener('click', async () => {
        const inputEl = document.getElementById('drawer-chat-input'); const question = inputEl.value.trim();
        if (!question) return;
        addChatMessage(question, 'user'); inputEl.value = '';

        const prompt = `Cümle: "${currentDrawerContext}". Soru: "${question}". Yeni başlayan öğrenciye açıklar gibi cevap ver.` + STRICT_PROMPT_RULE;
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
        const msgContainer = document.createElement('div');
        msgContainer.style.display = "flex"; msgContainer.style.flexDirection = "column"; msgContainer.style.maxWidth = "90%"; msgContainer.style.marginBottom = "20px";
        if (sender === 'user') { msgContainer.style.alignSelf = "flex-end"; } else { msgContainer.style.alignSelf = "flex-start"; }

        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-msg chat-${sender}`; msgDiv.style.marginBottom = "5px"; msgDiv.style.maxWidth = "100%"; 
        
        // DEĞİŞEN KISIM: Gelen metni parser'dan geçirip basıyoruz
        msgDiv.innerHTML = formatTextToHTML(text); 
        msgContainer.appendChild(msgDiv);

        if (sender === 'ai' && !text.includes("Analiz ediliyor") && !text.includes("Öğretmen analiz ediyor") && text !== "...") {
            const btnSaveNote = document.createElement('button');
            btnSaveNote.className = "btn-action-sm"; btnSaveNote.style.alignSelf = "flex-start"; btnSaveNote.style.marginLeft = "10px"; btnSaveNote.style.color = "var(--secondary-color)";
            btnSaveNote.innerHTML = '<i class="fa-regular fa-bookmark"></i> Notlara Ekle';
            btnSaveNote.onclick = () => window.openNoteModal(text); // Tıklandığında raw text modal'a yollanır
            msgContainer.appendChild(btnSaveNote);
        }

        chatContent.appendChild(msgContainer); chatContent.scrollTop = chatContent.scrollHeight;
    }

    // --- MANUEL NOT EKLEME ---
    document.getElementById('btn-add-manual-note').addEventListener('click', () => {
        const title = document.getElementById('manual-note-title').value.trim();
        const content = document.getElementById('manual-note-content').value.trim();
        
        if (!title || !content) { alert("Lütfen başlık ve içerik alanlarını doldurun."); return; }
        
        // DEĞİŞEN KISIM: Kendi eklediğin notlar da Markdown kontrolünden geçecek
        const formattedContent = formatTextToHTML(content); 
        notesVault.unshift({ id: Date.now(), title: title, content: formattedContent, lang: studyLang });
        localStorage.setItem('dil_notes', JSON.stringify(notesVault)); 
        renderNotesList();
        
        document.getElementById('manual-note-title').value = "";
        document.getElementById('manual-note-content').value = "";
        alert("Not başarıyla havuza eklendi!");
    });

    // --- OTOMATİK NOT KAYIT MODÜLÜ ---
    window.openNoteModal = (content) => {
        pendingNoteContent = content; document.getElementById('note-title-input').value = ""; document.getElementById('note-title-modal').classList.remove('hidden');
    };

    document.getElementById('btn-cancel-note').addEventListener('click', () => { document.getElementById('note-title-modal').classList.add('hidden'); });

    document.getElementById('btn-save-note-confirm').addEventListener('click', () => {
        const title = document.getElementById('note-title-input').value.trim();
        if (!title) { alert("Lütfen notun için bir başlık belirle."); return; }
        
        // DEĞİŞEN KISIM: Kaydedilirken parser'dan geçirilerek havuza atılır
        notesVault.unshift({ id: Date.now(), title: title, content: formatTextToHTML(pendingNoteContent), lang: studyLang });
        localStorage.setItem('dil_notes', JSON.stringify(notesVault)); renderNotesList();
        document.getElementById('note-title-modal').classList.add('hidden'); alert("Not başarıyla havuza kaydedildi!");
    });

    function renderNotesList() {
        const container = document.getElementById('notes-list-container');
        if (notesVault.length === 0) { container.innerHTML = '<div class="empty-vault-msg">Henüz kaydedilmiş not yok. AI analizlerini "Notlara Ekle" butonuyla buraya alabilirsin.</div>'; return; }
        
        container.innerHTML = '';
        notesVault.forEach(note => {
            const div = document.createElement('div'); div.className = 'story-item'; 
            div.innerHTML = `
                <div class="story-header" onclick="toggleNote(${note.id})">
                    <div class="story-item-title" style="color: var(--secondary-color);"><i class="fa-solid fa-bookmark"></i> ${note.title} <small style="color:#888; margin-left:5px;">(${note.lang})</small></div>
                    <div><button class="mini-btn" style="background:transparent; color:#cf6679;" onclick="event.stopPropagation(); deleteNote(${note.id})"><i class="fa-solid fa-trash"></i></button></div>
                </div>
                <div class="story-content-box note-content-box hidden" id="note-content-${note.id}">${note.content}</div>
            `;
            container.appendChild(div);
        });
    }

    window.toggleNote = (id) => {
        const contentBox = document.getElementById(`note-content-${id}`);
        if (contentBox.classList.contains('hidden')) {
            document.querySelectorAll('.note-content-box').forEach(el => el.classList.add('hidden')); 
            contentBox.classList.remove('hidden'); history.pushState({ noteOpen: id }, ""); 
        } else { contentBox.classList.add('hidden'); }
    };

    window.deleteNote = (id) => {
        if(confirm("Bu notu silmek istediğine emin misin?")) { notesVault = notesVault.filter(n => n.id !== id); localStorage.setItem('dil_notes', JSON.stringify(notesVault)); renderNotesList(); }
    };

    document.getElementById('btn-clear-all-notes').addEventListener('click', () => {
        if(confirm("Tüm notları silmek istediğine emin misin?")) { notesVault = []; localStorage.setItem('dil_notes', JSON.stringify(notesVault)); renderNotesList(); }
    });


    // --- KELİME LİSTESİ MODALI (HAMBURGER) ---
    document.getElementById('btn-open-word-list').addEventListener('click', () => {
        renderModalVaultList();
        document.getElementById('word-list-modal').classList.remove('hidden');
        history.pushState({ wordListOpen: true }, "");
    });

    document.getElementById('btn-close-word-list').addEventListener('click', () => {
        document.getElementById('word-list-modal').classList.add('hidden');
        if (history.state && history.state.wordListOpen) history.back();
    });

    document.getElementById('chk-select-all-words').addEventListener('change', (e) => {
        const checkboxes = document.querySelectorAll('.modal-vault-checkbox');
        checkboxes.forEach(cb => cb.checked = e.target.checked);
    });

    function syncModalVaultCheckbox() {
        const all = document.querySelectorAll('.modal-vault-checkbox');
        const checked = document.querySelectorAll('.modal-vault-checkbox:checked');
        const chkAll = document.getElementById('chk-select-all-words');
        if(all.length > 0) chkAll.checked = (all.length === checked.length);
        else chkAll.checked = false;
    }

    function renderModalVaultList() {
        const list = document.getElementById('modal-vault-list');
        document.getElementById('chk-select-all-words').checked = false;

        if(vault.length === 0) { list.innerHTML = '<p style="text-align:center; margin-top:20px; opacity:0.6;">Havuz boş.</p>'; return; }
        
        list.innerHTML = '';
        vault.forEach(item => {
            const row = document.createElement('div'); row.className = 'extracted-row';
            row.innerHTML = `
                <input type="checkbox" class="modal-vault-checkbox" value="${item.id}">
                <div class="extracted-info">
                    <div><span class="ext-word">${item.frontWord}</span> <span class="ext-trans">- ${item.backTranslation}</span></div>
                    <span class="ext-pos">${item.pos || ''}</span>
                </div>
            `;
            row.addEventListener('click', (e) => {
                if(e.target.type !== 'checkbox') { const cb = row.querySelector('.modal-vault-checkbox'); cb.checked = !cb.checked; }
                syncModalVaultCheckbox();
            });
            row.querySelector('.modal-vault-checkbox').addEventListener('change', syncModalVaultCheckbox);
            list.appendChild(row);
        });
    }

    document.getElementById('btn-delete-selected-words').addEventListener('click', () => {
        const checked = document.querySelectorAll('.modal-vault-checkbox:checked');
        if(checked.length === 0) { alert("Silmek için kelime seçin."); return; }
        
        if(confirm(`${checked.length} adet kelimeyi tamamen silmek istediğine emin misin?`)) {
            const idsToDelete = Array.from(checked).map(cb => parseInt(cb.value));
            vault = vault.filter(v => !idsToDelete.includes(v.id));
            localStorage.setItem('myVault', JSON.stringify(vault));
            renderModalVaultList();
            checkFlashcardState();
        }
    });

    // --- 🎯 EFSANE OYUNLAŞTIRILMIŞ EĞİTİM MODÜLÜ ---
    
    function checkFlashcardState() {
        const container = document.getElementById('flashcard-container');
        const chatBox = document.getElementById('fc-chat-box');

        if (studyPhase === 'none') {
            document.getElementById('flashcard-controls').classList.add('hidden');
            document.getElementById('quiz-controls').classList.add('hidden');
            if(chatBox) chatBox.classList.add('hidden');

            if (vault.length === 0) {
                container.innerHTML = '<div class="empty-vault-msg">Havuz boş. Öğrenmek için önce kelime kaydedin.</div>';
            } else {
                container.innerHTML = '<div class="empty-vault-msg" style="color:var(--secondary-color); font-size:16px;"><i class="fa-solid fa-arrow-up"></i><br>Çalışmaya başlamak için yukarıdaki butonları kullanın!</div>';
            }
        } else {
            if(chatBox) chatBox.classList.remove('hidden');
        }
    }

    // Seçim ve Rastgele Modları (Yeni Butonlarla Uyumlu)
    if(document.getElementById('btn-random-session')) {
        document.getElementById('btn-random-session').addEventListener('click', () => { openPrepModal(true); });
    }
    if(document.getElementById('btn-custom-session')) {
        document.getElementById('btn-custom-session').addEventListener('click', () => { openPrepModal(false); });
    }

    function openPrepModal(isRandom) {
        if (vault.length === 0) { alert("Havuz boş! Önce kelime kaydetmelisin."); return; }
        if (studyPhase !== 'none') {
            if (!confirm("Henüz mevcut oturumu bitirmediniz. Yine de iptal edip yeni kelimeler seçmek istiyor musunuz?")) return;
        }

        if (isRandom) {
            let shuffled = [...vault].sort(() => 0.5 - Math.random());
            draftSessionCards = shuffled.slice(0, 20);
            if(document.getElementById('prep-modal-desc')) document.getElementById('prep-modal-desc').innerText = "Rastgele seçilen 20 kelime aşağıdadır. İstemediğini çıkarabilirsin.";
            if(document.getElementById('btn-prep-replace')) document.getElementById('btn-prep-replace').classList.remove('hidden');
            renderPrepList(true); 
        } else {
            draftSessionCards = [...vault];
            if(document.getElementById('prep-modal-desc')) document.getElementById('prep-modal-desc').innerText = "Havuza eklediğin tüm kelimeler aşağıdadır. Çalışmak istediklerini seç.";
            if(document.getElementById('btn-prep-replace')) document.getElementById('btn-prep-replace').classList.add('hidden'); 
            renderPrepList(false); 
        }

        document.getElementById('session-prep-modal').classList.remove('hidden');
        history.pushState({ prepOpen: true }, "");
    }

    function renderPrepList(selectAll = true) {
        const list = document.getElementById('prep-word-list');
        list.innerHTML = '';
        draftSessionCards.forEach((item, index) => {
            const row = document.createElement('div'); row.className = 'extracted-row';
            row.innerHTML = `
                <input type="checkbox" class="prep-checkbox" value="${item.id}" ${selectAll ? 'checked' : ''}>
                <div class="extracted-info">
                    <div><span class="ext-word">${item.frontWord}</span> <span class="ext-trans">- ${item.backTranslation}</span></div>
                </div>
            `;
            row.addEventListener('click', (e) => {
                if(e.target.type !== 'checkbox') { const cb = row.querySelector('.prep-checkbox'); cb.checked = !cb.checked; }
                syncPrepCheckbox();
            });
            row.querySelector('.prep-checkbox').addEventListener('change', syncPrepCheckbox);
            list.appendChild(row);
        });
        document.getElementById('chk-prep-select-all').checked = selectAll;
    }

    document.getElementById('chk-prep-select-all').addEventListener('change', (e) => {
        const checkboxes = document.querySelectorAll('.prep-checkbox');
        checkboxes.forEach(cb => cb.checked = e.target.checked);
    });

    function syncPrepCheckbox() {
        const all = document.querySelectorAll('.prep-checkbox');
        const checked = document.querySelectorAll('.prep-checkbox:checked');
        const chkAll = document.getElementById('chk-prep-select-all');
        if(all.length > 0) chkAll.checked = (all.length === checked.length);
        else chkAll.checked = false;
    }

    if(document.getElementById('btn-prep-replace')) {
        document.getElementById('btn-prep-replace').addEventListener('click', () => {
            const checkboxes = document.querySelectorAll('.prep-checkbox');
            const unselectedIndexes = [];
            checkboxes.forEach((cb, index) => { if (!cb.checked) unselectedIndexes.push(index); });

            if (unselectedIndexes.length === 0) { alert("Değiştirmek için bazı kelimelerin seçimini kaldırmalısınız."); return; }

            const currentIds = draftSessionCards.map(c => c.id);
            let availableWords = vault.filter(v => !currentIds.includes(v.id));

            if (availableWords.length === 0) { alert("Havuzda değiştirecek başka yeni kelime kalmadı!"); return; }

            availableWords = availableWords.sort(() => 0.5 - Math.random());

            unselectedIndexes.forEach(idx => {
                if (availableWords.length > 0) { draftSessionCards[idx] = availableWords.pop(); }
            });
            renderPrepList(true);
        });
    }

    document.getElementById('btn-prep-close').addEventListener('click', () => {
        document.getElementById('session-prep-modal').classList.add('hidden');
        if (history.state && history.state.prepOpen) history.back();
    });

    document.getElementById('btn-prep-start').addEventListener('click', () => {
        const checkedBoxes = document.querySelectorAll('.prep-checkbox:checked');
        if (checkedBoxes.length === 0) { alert("En az bir kelime seçmelisin."); return; }
        
        const selectedIds = Array.from(checkedBoxes).map(cb => parseInt(cb.value));
        const finalSelection = draftSessionCards.filter(c => selectedIds.includes(c.id));

        document.getElementById('session-prep-modal').classList.add('hidden');
        if (history.state && history.state.prepOpen) history.back();
        
        initStudySession(finalSelection, true, 'flashcards');
    });

    if(document.getElementById('btn-sentence-quiz-start')) {
        document.getElementById('btn-sentence-quiz-start').addEventListener('click', () => {
            if (vault.length === 0) { alert("Havuz boş!"); return; }
            if (studyPhase !== 'none' && !confirm("Mevcut oturumu iptal edip yeni başlamak istiyor musun?")) return;

            let validItems = vault.filter(v => v.example && v.example.length > 5 && v.example.toLowerCase().includes(v.frontWord.toLowerCase()));
            
            if(validItems.length < 5) {
                alert("Havuzda içinde kelimenin tam geçtiği yeterli örnek cümle bulunamadı. Lütfen analizlerden bol bol kelime ayıklayıp havuza atın.");
                return;
            }

            let shuffled = validItems.sort(() => 0.5 - Math.random());
            let selected = shuffled.slice(0, 20);

            initStudySession(selected, true, 'sentence-quiz');
        });
    }

    // Oturum Başlatıcı
    function initStudySession(cardsArray, isNewSession = false, type = 'flashcards') {
        if (cardsArray.length === 0) return;
        
        sessionVault = cardsArray.map(card => ({...card, answered: false, isCorrect: false, userAnswer: ""}));
        currentCardIndex = 0;
        studyPhase = type; 
        
        if(document.getElementById('fc-chat-content')) document.getElementById('fc-chat-content').innerHTML = ''; 

        if (type === 'flashcards') {
            document.getElementById('quiz-controls').classList.add('hidden');
            document.getElementById('flashcard-controls').classList.remove('hidden');
            if (!isNewSession) { alert("Geçmiş çalışma oturumu başlatıldı. Bol şans!"); }
            renderFlashcard();
            checkFlashcardState();
        } else if (type === 'sentence-quiz') {
            startSentenceQuizPhase();
        }
    }

    if(document.getElementById('btn-fc-chat-send')) {
        document.getElementById('btn-fc-chat-send').addEventListener('click', async () => {
            const inputEl = document.getElementById('fc-chat-input'); 
            const question = inputEl.value.trim();
            if (!question || studyPhase === 'none') return;
            
            const chatContentBox = document.getElementById('fc-chat-content');
            
            const userDiv = document.createElement('div'); 
            userDiv.className = 'chat-msg chat-user'; 
            userDiv.style.alignSelf = "flex-end"; 
            userDiv.style.marginBottom = "10px";
            userDiv.innerText = question;
            chatContentBox.appendChild(userDiv); 
            inputEl.value = '';
            chatContentBox.scrollTop = chatContentBox.scrollHeight;

            let contextWord = "";
            let contextExample = "";
            if (studyPhase === 'flashcards') { 
                contextWord = sessionVault[currentCardIndex].frontWord; 
                contextExample = sessionVault[currentCardIndex].example || "";
            }
            else if (studyPhase === 'quiz' || studyPhase === 'sentence-quiz') { 
                contextWord = quizQueue[currentQuizIndex].frontWord; 
                contextExample = quizQueue[currentQuizIndex].example || "";
            }

            const prompt = `Şu an çalıştığım kelime: "${contextWord}". İlgili cümle: "${contextExample}". Sorum şu: "${question}". Yeni başlayan bir öğrenciye açıklar gibi yanıtla.` + STRICT_PROMPT_RULE;
            
            const loadingDiv = document.createElement('div'); loadingDiv.className = 'chat-msg chat-ai'; loadingDiv.innerText = "...";
            chatContentBox.appendChild(loadingDiv); chatContentBox.scrollTop = chatContentBox.scrollHeight;

            const answer = await callGemini(null, prompt, false);
            loadingDiv.remove();

            const aiDiv = document.createElement('div'); 
            aiDiv.className = 'chat-msg chat-ai'; 
            aiDiv.style.alignSelf = "flex-start"; 
            aiDiv.style.marginBottom = "5px";
            // DEĞİŞEN KISIM: Chat asistanında da markdown kontrolü
            aiDiv.innerHTML = formatTextToHTML(answer) || "Yanıt alınamadı."; 
            
            const btnSaveNote = document.createElement('button');
            btnSaveNote.className = "btn-action-sm"; 
            btnSaveNote.style.alignSelf = "flex-start"; 
            btnSaveNote.style.color = "var(--secondary-color)";
            btnSaveNote.style.marginBottom = "15px";
            btnSaveNote.innerHTML = '<i class="fa-regular fa-bookmark"></i> Notlara Ekle';
            btnSaveNote.onclick = () => window.openNoteModal(answer);
            
            const wrapDiv = document.createElement('div'); 
            wrapDiv.style.display="flex"; 
            wrapDiv.style.flexDirection="column"; 
            wrapDiv.appendChild(aiDiv); 
            wrapDiv.appendChild(btnSaveNote);
            
            chatContentBox.appendChild(wrapDiv);
            chatContentBox.scrollTop = chatContentBox.scrollHeight;
        });

        document.getElementById('btn-clear-fc-chat').addEventListener('click', () => { document.getElementById('fc-chat-content').innerHTML = ''; });
    }

    // GEÇMİŞ OTURUMLAR MODALI
    document.getElementById('btn-open-past-sessions').addEventListener('click', () => {
        renderPastSessions(); 
        document.getElementById('past-sessions-modal').classList.remove('hidden');
        history.pushState({ pastSessionsOpen: true }, "");
    });
    document.getElementById('btn-close-past-sessions').addEventListener('click', () => { 
        document.getElementById('past-sessions-modal').classList.add('hidden'); 
        if (history.state && history.state.pastSessionsOpen) history.back();
    });

    function renderPastSessions() {
        const container = document.getElementById('past-sessions-list');
        if (studySessionsVault.length === 0) {
            container.innerHTML = '<div class="empty-vault-msg" style="padding:10px;">Henüz geçmiş oturum yok. Çalışmaya başlayın.</div>'; return;
        }
        container.innerHTML = '';
        studySessionsVault.forEach(session => {
            const div = document.createElement('div'); div.className = 'session-history-item';
            div.innerHTML = `
                <div class="session-info">
                    <span class="session-date"><i class="fa-regular fa-calendar-check"></i> ${session.dateStr}</span>
                    <span class="session-count">${session.cards.length} Kelime</span>
                </div>
                <div style="display:flex; gap:5px;">
                    <button class="action-btn mini" style="background:var(--secondary-color); color:#000;" onclick="startPastSession(${session.id})">Çalış</button>
                    <button class="action-btn mini" style="background:transparent; border:1px solid #cf6679; color:#cf6679;" onclick="deletePastSession(${session.id})"><i class="fa-solid fa-trash"></i></button>
                </div>
            `;
            container.appendChild(div);
        });
    }

    window.startPastSession = (id) => {
        const session = studySessionsVault.find(s => s.id === id);
        if (session) { 
            document.getElementById('past-sessions-modal').classList.add('hidden'); 
            if (history.state && history.state.pastSessionsOpen) history.back();
            initStudySession(session.cards, false, 'flashcards'); 
        }
    };
    window.deletePastSession = (id) => {
        if(confirm("Silmek istediğine emin misin?")) {
            studySessionsVault = studySessionsVault.filter(s => s.id !== id);
            localStorage.setItem('dil_study_sessions', JSON.stringify(studySessionsVault)); renderPastSessions();
        }
    };

    // --- AŞAMA 1: EĞİTİM KARTLARI ---
    function renderFlashcard() {
        const container = document.getElementById('flashcard-container');
        if (sessionVault.length === 0) return;

        document.getElementById('card-counter').innerText = `${currentCardIndex + 1} / ${sessionVault.length}`;
        const cardData = sessionVault[currentCardIndex];
        
        const btnNext = document.getElementById('btn-next-card');
        if (currentCardIndex === sessionVault.length - 1) {
            btnNext.innerHTML = 'Sınava Geç <i class="fa-solid fa-arrow-right"></i>';
            btnNext.style.background = "var(--primary-color)";
            btnNext.style.color = "#fff";
            btnNext.style.width = "auto";
        } else {
            btnNext.innerHTML = '<i class="fa-solid fa-arrow-right"></i>';
            btnNext.style.background = ""; 
            btnNext.style.color = "";
            btnNext.style.width = "";
        }

        container.innerHTML = `
            <div class="flashcard" onclick="this.classList.toggle('flipped')">
                <div class="card-face card-front">
                    <button class="tts-icon" onclick="event.stopPropagation(); playAudio('${cardData.frontWord}', '${cardData.lang}')"><i class="fa-solid fa-volume-high"></i></button>
                    <div class="fc-word">${cardData.frontWord || "Hata"}</div>
                    <div class="fc-type">${cardData.pos || "Kelime Türü Belirsiz"}</div>
                    <div class="fc-example">"${cardData.example || ""}"</div>
                    <div class="fc-hint">Çeviri İçin Dokun <i class="fa-solid fa-rotate"></i> <span>(Sağa/Sola Kaydır)</span></div>
                </div>
                <div class="card-face card-back">
                    <div class="fc-word">${cardData.backTranslation || ""}</div>
                    <div class="fc-details" onclick="event.stopPropagation();">${cardData.regularity || "Ekstra detay bulunmuyor."}</div>
                    <div class="fc-example">"${cardData.backExample || "-"}"</div>
                </div>
            </div>
        `;
    }

    document.getElementById('btn-prev-card').addEventListener('click', () => {
        if (studyPhase === 'flashcards' && currentCardIndex > 0) { currentCardIndex--; renderFlashcard(); }
    });

    document.getElementById('btn-next-card').addEventListener('click', () => {
        if (studyPhase === 'flashcards') {
            if (currentCardIndex < sessionVault.length - 1) {
                currentCardIndex++; renderFlashcard();
            } else {
                startQuizPhase(); // Son karttaysa sınava geç
            }
        }
    });

    // --- AŞAMA 2: YAZILI SINAV (MANUEL İLERLEME) ---
    function startQuizPhase() {
        studyPhase = 'quiz';
        document.getElementById('flashcard-controls').classList.add('hidden');
        document.getElementById('quiz-controls').classList.remove('hidden');
        
        quizQueue = [...sessionVault].sort(() => 0.5 - Math.random());
        currentQuizIndex = 0; quizScore = 0;
        renderQuizCard();
    }

    function startSentenceQuizPhase() {
        studyPhase = 'sentence-quiz';
        document.getElementById('flashcard-controls').classList.add('hidden');
        document.getElementById('quiz-controls').classList.remove('hidden');
        checkFlashcardState(); 
        
        quizQueue = [...sessionVault]; 
        currentQuizIndex = 0; quizScore = 0;
        renderQuizCard();
    }

    function renderQuizCard() {
        const container = document.getElementById('flashcard-container');
        if (currentQuizIndex >= quizQueue.length) { showQuizResult(); return; }

        const cardData = quizQueue[currentQuizIndex];
        const flippedClass = (cardData.answered && !cardData.isCorrect) ? 'flipped' : '';

        const btnNext = document.getElementById('btn-quiz-next');
        if (currentQuizIndex === quizQueue.length - 1) {
            btnNext.innerHTML = 'Testi Bitir <i class="fa-solid fa-flag-checkered"></i>';
            btnNext.style.background = "var(--primary-color)";
            btnNext.style.color = "#fff";
        } else {
            btnNext.innerHTML = 'Sonraki <i class="fa-solid fa-arrow-right"></i>';
            btnNext.style.background = "rgba(128,128,128,0.2)";
            btnNext.style.color = "var(--text-color)";
        }

        let questionDisplay = "";
        if (studyPhase === 'sentence-quiz') {
            const regex = new RegExp(cardData.frontWord, "gi");
            questionDisplay = cardData.example.replace(regex, "<b>_____</b>");
            document.getElementById('quiz-question-text').innerHTML = `Cümleyi Tamamla:<br><br><span style="font-size:16px; font-weight:normal;">${questionDisplay}</span>`;
            document.getElementById('quiz-hint-text').innerText = `İpucu (TR): ${cardData.backTranslation}`;
        } else {
            document.getElementById('quiz-question-text').innerText = `Türkçesi: ${cardData.backTranslation}`;
            document.getElementById('quiz-hint-text').innerText = cardData.backExample && cardData.backExample !== "-" ? `Örnek: "${cardData.backExample}"` : "";
        }

        container.innerHTML = `
            <div class="flashcard ${flippedClass}" style="cursor:default;" id="active-quiz-card">
                <div class="card-face card-front" style="justify-content: flex-start; padding-top:40px;">
                    <div style="font-size:12px; color:var(--secondary-color); font-weight:bold; letter-spacing:1px; text-transform:uppercase; margin-bottom: 20px;">Soru ${currentQuizIndex + 1} / ${quizQueue.length}</div>
                    <div style="font-size:50px; margin-bottom:10px; opacity:0.2;"><i class="fa-solid fa-pen-to-square"></i></div>
                    <div style="font-size:16px; color:var(--text-color); margin-bottom: 10px;">Aşağıdaki alanları kullanarak hedef kelimeyi yazın.</div>
                </div>
                <div class="card-face card-back" style="transform: rotateY(180deg); justify-content:center;">
                    <div style="color:#cf6679; font-size:14px; font-weight:bold; margin-bottom:10px; text-transform:uppercase;">Yanlış Cevap! Doğrusu:</div>
                    <div class="fc-word" style="color:#cf6679;">${cardData.frontWord}</div>
                    <div class="fc-details" style="margin-top:15px;">${cardData.example || ""}</div>
                </div>
            </div>
        `;
        
        const inputEl = document.getElementById('quiz-input');
        const feedbackEl = document.getElementById('quiz-feedback');
        const btnCheck = document.getElementById('btn-quiz-check');

        if (cardData.answered) {
            inputEl.value = cardData.userAnswer;
            inputEl.disabled = true;
            btnCheck.disabled = true;
            inputEl.className = ""; 
            
            if (cardData.isCorrect) {
                inputEl.classList.add('quiz-input-correct');
                feedbackEl.style.color = "var(--secondary-color)";
                feedbackEl.innerText = "Doğru! ✅";
            } else {
                inputEl.classList.add('quiz-input-wrong');
                feedbackEl.style.color = "#cf6679";
                feedbackEl.innerText = "Hatalı! ❌";
            }
        } else {
            inputEl.value = ""; 
            inputEl.disabled = false;
            btnCheck.disabled = false;
            inputEl.className = ""; 
            inputEl.style.flex = "1"; inputEl.style.padding = "12px"; inputEl.style.borderRadius = "10px"; inputEl.style.border = "1px solid rgba(128,128,128,0.4)"; inputEl.style.background = "rgba(0,0,0,0.2)"; inputEl.style.color = "var(--text-color)"; inputEl.style.outline = "none"; inputEl.style.textAlign = "center"; inputEl.style.fontSize = "16px";
            feedbackEl.innerText = ""; 
            setTimeout(() => inputEl.focus(), 100);
        }

        document.getElementById('btn-quiz-prev').disabled = (currentQuizIndex === 0);
    }

    document.getElementById('btn-quiz-check').addEventListener('click', checkQuizAnswer);
    document.getElementById('quiz-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') checkQuizAnswer(); });

    document.getElementById('btn-quiz-prev').addEventListener('click', () => {
        if(currentQuizIndex > 0) { currentQuizIndex--; renderQuizCard(); }
    });
    
    document.getElementById('btn-quiz-next').addEventListener('click', () => {
        if(currentQuizIndex < quizQueue.length - 1) { 
            currentQuizIndex++; 
            renderQuizCard(); 
        } else {
            const allAnswered = quizQueue.every(q => q.answered);
            if (!allAnswered) {
                if(!confirm("Cevaplamadığın sorular var. Testi bu şekilde bitirmek istiyor musun?")) return;
            }
            showQuizResult();
        }
    });

    function checkQuizAnswer() {
        if (studyPhase !== 'quiz' && studyPhase !== 'sentence-quiz') return;
        const cardData = quizQueue[currentQuizIndex];
        if (cardData.answered) return; 

        const inputEl = document.getElementById('quiz-input');
        const feedbackEl = document.getElementById('quiz-feedback');
        const btnCheck = document.getElementById('btn-quiz-check');
        const activeCard = document.getElementById('active-quiz-card');
        
        let userAnswer = inputEl.value.trim().toLowerCase();
        let correctAnswer = cardData.frontWord.trim().toLowerCase();

        userAnswer = userAnswer.replace(/\s+/g, ' '); correctAnswer = correctAnswer.replace(/\s+/g, ' ');
        if (!userAnswer) return;

        btnCheck.disabled = true; 
        inputEl.disabled = true;
        cardData.answered = true;
        cardData.userAnswer = userAnswer;

        if (userAnswer === correctAnswer) {
            quizScore++; 
            cardData.isCorrect = true;
            inputEl.classList.add('quiz-input-correct'); 
            feedbackEl.style.color = "var(--secondary-color)"; 
            feedbackEl.innerText = "Doğru! ✅";
            playAudio(cardData.frontWord, studyLang); 
        } else {
            cardData.isCorrect = false;
            inputEl.classList.add('quiz-input-wrong'); 
            feedbackEl.style.color = "#cf6679"; 
            feedbackEl.innerText = "Hatalı! ❌";
            playAudio(cardData.frontWord, studyLang); 
            if (activeCard) activeCard.classList.add('flipped');
        }
    }

    function showQuizResult() {
        studyPhase = 'none';
        document.getElementById('quiz-controls').classList.add('hidden');
        if(document.getElementById('fc-chat-box')) document.getElementById('fc-chat-box').classList.add('hidden');
        
        const container = document.getElementById('flashcard-container');
        let successRate = Math.round((quizScore / quizQueue.length) * 100);
        let message = ""; let color = "";

        if (successRate >= 90) { message = "Muhteşem!"; color = "var(--secondary-color)"; }
        else if (successRate >= 60) { message = "İyi iş çıkardın, biraz daha tekrar!"; color = "var(--primary-color)"; }
        else { message = "Pes etmek yok, tekrar dene!"; color = "#cf6679"; }

        const now = new Date();
        const dateStr = now.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const newSessionRecord = { id: Date.now(), dateStr: dateStr, cards: [...sessionVault] };
        studySessionsVault.unshift(newSessionRecord);
        if (studySessionsVault.length > 50) studySessionsVault.pop();
        localStorage.setItem('dil_study_sessions', JSON.stringify(studySessionsVault));

        container.innerHTML = `
            <div class="flashcard" style="cursor:default;">
                <div class="card-face card-front" style="justify-content: center;">
                    <div style="font-size:60px; color:${color}; margin-bottom:20px;"><i class="fa-solid fa-trophy"></i></div>
                    <div style="font-size:24px; font-weight:bold; color:${color}; margin-bottom:10px;">${message}</div>
                    <div style="font-size:16px; color:var(--text-color); margin-bottom:30px;">${quizQueue.length} kelimenin <b>${quizScore}</b> tanesini doğru yazdın.</div>
                    <div style="font-size:30px; font-weight:bold; border:2px solid ${color}; color:${color}; padding:10px 30px; border-radius:20px; background:rgba(0,0,0,0.2);">%${successRate}</div>
                    <button class="action-btn mini" style="margin-top:20px;" onclick="document.querySelector('[data-sub=\\'sub-kelimeler\\']').click(); checkFlashcardState();">Bitir</button>
                </div>
            </div>
        `;
    }

   // HAVUZ GENEL SWIPE (Kaydırma) KONTROLLERİ
    let touchstartX = 0; let touchendX = 0;
    const vocabTab = document.getElementById('tab-vocab');
    
    vocabTab.addEventListener('touchstart', e => { touchstartX = e.changedTouches[0].screenX; }, {passive: true});
    vocabTab.addEventListener('touchend', e => {
        
        // YENİ EKLENEN KOD: Eğer parmak bir not kutusunun veya tablonun içindeyse bizim sekme değiştirme kodumuzu çalıştırma.
        if (e.target.closest('.note-content-box') || e.target.closest('.table-responsive')) return;

        touchendX = e.changedTouches[0].screenX;
        let isInsideCard = e.target.closest('.flashcard-container'); 
        const currentSubTab = document.querySelector('.sub-nav-btn.active').getAttribute('data-sub');
               
        if (studyPhase === 'flashcards' && isInsideCard) {
            if (touchendX < touchstartX - 50) document.getElementById('btn-next-card').click(); 
            if (touchendX > touchstartX + 50) document.getElementById('btn-prev-card').click();  
            return;
        }

        if ((studyPhase === 'quiz' || studyPhase === 'sentence-quiz') && isInsideCard) {
            if (touchendX < touchstartX - 60) document.getElementById('btn-quiz-next').click(); 
            if (touchendX > touchstartX + 60) document.getElementById('btn-quiz-prev').click(); 
            return;
        }

        if (studyPhase === 'none') {
            if (touchendX < touchstartX - 60) {
                if (currentSubTab === 'sub-kelimeler') document.querySelector('[data-sub="sub-notlar"]').click(); 
            }
            if (touchendX > touchstartX + 60) {
                if (currentSubTab === 'sub-notlar') document.querySelector('[data-sub="sub-kelimeler"]').click(); 
            }
        }
    }, {passive: true});

    document.getElementById('btn-export-vault').addEventListener('click', () => {
        const fullBackup = {
            vault: vault, storyVault: storyVault, aiCache: aiCache, chatHistoryVault: chatHistoryVault, notesVault: notesVault, studySessionsVault: studySessionsVault,
            settings: { apiKeys: localStorage.getItem('gemini_api_keys') || "", nativeLang: nativeLang, studyLang: studyLang, theme: localStorage.getItem('dil_theme_class') || "" }
        };
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(fullBackup));
        const dlAnchorElem = document.createElement('a'); dlAnchorElem.setAttribute("href", dataStr); dlAnchorElem.setAttribute("download", "dil_ai_tam_yedek.json"); dlAnchorElem.click();
    });

    document.getElementById('import-vault').addEventListener('change', (event) => {
        const file = event.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                if (Array.isArray(importedData)) {
                    vault = importedData; sessionVault = [...vault]; localStorage.setItem('myVault', JSON.stringify(vault));
                    currentCardIndex = 0; alert("Eski tip kelime yedeği yüklendi!"); checkFlashcardState();
                } else if (importedData.vault !== undefined) {
                    if(confirm("Mevcut tüm verilerin silinip yedektekilerin yüklenecek. Emin misin?")) {
                        localStorage.setItem('myVault', JSON.stringify(importedData.vault || []));
                        localStorage.setItem('myStories', JSON.stringify(importedData.storyVault || []));
                        localStorage.setItem('dil_ai_cache', JSON.stringify(importedData.aiCache || {}));
                        localStorage.setItem('dil_chat_history', JSON.stringify(importedData.chatHistoryVault || {}));
                        localStorage.setItem('dil_notes', JSON.stringify(importedData.notesVault || []));
                        localStorage.setItem('dil_study_sessions', JSON.stringify(importedData.studySessionsVault || []));
                        if (importedData.settings) {
                            localStorage.setItem('gemini_api_keys', importedData.settings.apiKeys || "");
                            localStorage.setItem('nativeLang', importedData.settings.nativeLang || "Türkçe");
                            localStorage.setItem('studyLang', importedData.settings.studyLang || "Almanca");
                            localStorage.setItem('dil_theme_class', importedData.settings.theme || "");
                        }
                        alert("Tüm veriler başarıyla geri yüklendi! Uygulama yenileniyor..."); location.reload(); 
                    }
                } else { alert("Geçersiz yedek dosyası!"); }
            } catch(err) { alert("Dosya okuma hatası."); }
        };
        reader.readAsText(file);
    });

    checkFlashcardState();
});
