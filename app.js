document.addEventListener('DOMContentLoaded', () => {
    
    // --- GLOBAL DEĞİŞKENLER ---
    let API_KEY = localStorage.getItem('gemini_api_key') || "";
    let nativeLang = localStorage.getItem('nativeLang') || "Türkçe";
    let studyLang = localStorage.getItem('studyLang') || "Almanca";
    let vault = JSON.parse(localStorage.getItem('myVault')) || [];
    let selectedText = ""; 
    let currentDrawerContext = ""; // AI sohbeti için aktif cümle

    // Ayarları HTML'e Yansıt
    if (document.getElementById('native-language')) document.getElementById('native-language').value = nativeLang;
    if (document.getElementById('study-language')) document.getElementById('study-language').value = studyLang;

    // --- NAVİGASYON ---
    const navBtns = document.querySelectorAll('.nav-btn');
    const sections = document.querySelectorAll('.tab-section');
    navBtns.forEach(btn => btn.addEventListener('click', () => {
        navBtns.forEach(b => b.classList.remove('active'));
        sections.forEach(s => s.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.getAttribute('data-target');
        document.getElementById(target).classList.add('active');
        if (target === 'tab-vocab') renderVault();
    }));

    // --- AYARLAR KAYDETME ---
    document.getElementById('btn-save-key').addEventListener('click', () => {
        const key = document.getElementById('api-key-input').value.trim();
        if (key) { localStorage.setItem('gemini_api_key', key); API_KEY = key; alert("API Anahtarı kaydedildi!"); }
    });
    if (API_KEY) document.getElementById('api-key-input').value = API_KEY;

    document.getElementById('native-language').addEventListener('change', (e) => {
        nativeLang = e.target.value; localStorage.setItem('nativeLang', nativeLang);
    });
    document.getElementById('study-language').addEventListener('change', (e) => {
        studyLang = e.target.value; localStorage.setItem('studyLang', studyLang);
    });

    // --- GEMINI API (2.5 Flash ile) ---
    async function callGemini(prompt) {
        if (!API_KEY) { alert("Lütfen Ayarlar'dan API Key girin!"); return null; }
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;
        
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            const data = await response.json();
            return data.candidates[0].content.parts[0].text;
        } catch (error) {
            console.error("AI Hatası:", error); return "Bir hata oluştu.";
        }
    }

    // --- STÜDYO: HİKAYE ÜRETİMİ ---
    document.getElementById('btn-generate-story').addEventListener('click', async () => {
        const input = document.getElementById('story-prompt').value;
        const display = document.getElementById('generated-story-display');
        if (!input) return;

        display.style.display = 'block';
        display.innerText = "Yapay zeka metni yazıyor...";
        
        const prompt = `Lütfen "${input}" konusu hakkında sadece ${studyLang} dilinde kısa bir metin yaz. Başka hiçbir dilde açıklama yapma.`;
        const story = await callGemini(prompt);
        if (story) {
            display.innerText = story;
            prepareLabText(story);
        }
    });

    // --- LABORATUVAR: MOBİL UYUMLU KELİME VE CÜMLE BÖLME ---
    function prepareLabText(text) {
        const labContainer = document.getElementById('text-container');
        labContainer.innerHTML = '';
        
        // Cümleleri ayır
        const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

        sentences.forEach(sentText => {
            const block = document.createElement('div');
            block.className = 'sentence-block';

            // Kelimeleri tek tek tıklanabilir yap (Mobil Seçim Çözümü)
            const words = sentText.trim().split(/\s+/);
            words.forEach(word => {
                const wordSpan = document.createElement('span');
                wordSpan.innerText = word + " ";
                wordSpan.className = 'clickable-word';
                wordSpan.addEventListener('click', (e) => {
                    e.stopPropagation();
                    // Noktalama işaretlerini temizleyerek kelimeyi seç
                    selectedText = word.replace(/[.,!?]/g, ''); 
                    showBubbleAtElement(wordSpan, selectedText);
                });
                block.appendChild(wordSpan);
            });

            // Cümle Sonu Aksiyonları (Çeviri ve Gramer)
            const actionsDiv = document.createElement('span');
            actionsDiv.className = 'sentence-actions';

            const btnTrans = document.createElement('button');
            btnTrans.className = 'btn-translate';
            btnTrans.innerHTML = '<i class="fa-solid fa-language"></i> Çevir';
            btnTrans.addEventListener('click', () => openDrawer(sentText.trim(), 'translate'));

            const btnGrammar = document.createElement('button');
            btnGrammar.className = 'btn-grammar';
            btnGrammar.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> İncele';
            btnGrammar.addEventListener('click', () => openDrawer(sentText.trim(), 'grammar'));

            actionsDiv.appendChild(btnTrans);
            actionsDiv.appendChild(btnGrammar);
            block.appendChild(actionsDiv);
            
            labContainer.appendChild(block);
        });
    }

    // --- BALONCUK (KELİME ÇEVİRİSİ) ---
    const bubble = document.getElementById('word-bubble');
    function showBubbleAtElement(el, text) {
        const rect = el.getBoundingClientRect();
        document.getElementById('bubble-translation').innerText = text;
        bubble.style.left = (rect.left + rect.width / 2) + window.scrollX + 'px';
        bubble.style.top = (rect.top + window.scrollY - 10) + 'px';
        bubble.style.display = 'flex';
        
        // Baloncuk açıldığında hemen o kelimenin çevirisini yap
        getQuickTranslation(text);
    }

    async function getQuickTranslation(word) {
        const span = document.getElementById('bubble-translation');
        span.innerText = "Yükleniyor...";
        const prompt = `Sadece şu kelimenin ${nativeLang} dilindeki tek kelimelik karşılığını ver: "${word}"`;
        const result = await callGemini(prompt);
        span.innerText = result ? result.trim() : word;
    }

    // Ekranda boş bir yere tıklanırsa baloncuğu kapat
    document.addEventListener('pointerup', (e) => {
        if (!e.target.closest('#word-bubble') && !e.target.closest('.clickable-word')) {
            bubble.style.display = 'none';
        }
    });

    // --- ETKİLEŞİMLİ ÇEKMECE (SOHBET VE ANALİZ) ---
    const drawer = document.getElementById('ai-drawer');
    const chatContent = document.getElementById('ai-response-content');
    
    async function openDrawer(sentence, action) {
        currentDrawerContext = sentence;
        drawer.classList.remove('hidden');
        chatContent.innerHTML = ''; // Önceki sohbeti temizle
        
        let prompt = "";
        let loadingMsg = "";

        if (action === 'translate') {
            loadingMsg = "Çeviri yapılıyor...";
            prompt = `Lütfen şu ${studyLang} cümlesini ${nativeLang} diline çevir: "${sentence}"`;
            document.getElementById('drawer-title').innerText = "Cümle Çevirisi";
        } else {
            loadingMsg = "Gramer analiz ediliyor...";
            prompt = `Lütfen şu cümlenin dilbilgisini ${nativeLang} dilinde açıkla. Zamanı, kuralları ve önemli kelimeleri belirt: "${sentence}"`;
            document.getElementById('drawer-title').innerText = "Gramer Analizi";
        }

        addChatMessage(loadingMsg, 'ai');
        const response = await callGemini(prompt);
        chatContent.innerHTML = ''; // Yükleniyor yazısını sil
        addChatMessage(response, 'ai');
    }

    // Çekmecede Soru Sorma (Chat)
    document.getElementById('btn-drawer-send').addEventListener('click', async () => {
        const inputEl = document.getElementById('drawer-chat-input');
        const question = inputEl.value.trim();
        if (!question) return;

        addChatMessage(question, 'user');
        inputEl.value = '';

        const aiContextPrompt = `Şu an üzerinde çalıştığımız ${studyLang} cümlesi: "${currentDrawerContext}". Kullanıcı sana bu cümleyle ilgili ${nativeLang} dilinde şu soruyu soruyor: "${question}". Lütfen detaylı ve anlaşılır bir şekilde cevap ver.`;
        
        // Geçici yükleniyor balonu
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'chat-msg chat-ai';
        loadingDiv.innerText = "Düşünüyor...";
        chatContent.appendChild(loadingDiv);
        chatContent.scrollTop = chatContent.scrollHeight;

        const answer = await callGemini(aiContextPrompt);
        loadingDiv.remove();
        addChatMessage(answer, 'ai');
    });

    function addChatMessage(text, sender) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-msg chat-${sender}`;
        msgDiv.innerText = text;
        chatContent.appendChild(msgDiv);
        chatContent.scrollTop = chatContent.scrollHeight; // Otomatik aşağı kaydır
    }

    document.getElementById('close-drawer').addEventListener('click', () => {
        drawer.classList.add('hidden');
    });

    // Seslendir ve Kaydet butonları
    document.getElementById('btn-speak').addEventListener('click', (e) => {
        e.stopPropagation();
        const ut = new SpeechSynthesisUtterance(selectedText);
        ut.lang = studyLang === 'Almanca' ? 'de-DE' : (studyLang === 'İngilizce' ? 'en-US' : 'es-ES');
        window.speechSynthesis.speak(ut);
    });

    document.getElementById('btn-save').addEventListener('click', (e) => {
        e.stopPropagation();
        if(!selectedText) return;
        vault.push({ id: Date.now(), text: selectedText, lang: studyLang });
        localStorage.setItem('myVault', JSON.stringify(vault));
        alert("Havuza Eklendi!");
        renderVault();
    });

    // Başlangıç Ayarları
    function renderVault() {
        const list = document.getElementById('vault-list');
        if(!list) return;
        list.innerHTML = vault.length === 0 ? '<p>Havuz boş.</p>' : '';
        vault.forEach(item => {
            const card = document.createElement('div');
            card.className = 'word-card';
            card.innerHTML = `<div><small>${item.lang}</small><div>${item.text}</div></div>
                              <button class="mini-btn" onclick="deleteWord(${item.id})"><i class="fa-solid fa-trash"></i></button>`;
            list.appendChild(card);
        });
    }

    window.deleteWord = (id) => {
        vault = vault.filter(v => v.id !== id);
        localStorage.setItem('myVault', JSON.stringify(vault));
        renderVault();
    };

    renderVault();
});
