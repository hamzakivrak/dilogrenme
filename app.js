document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. GLOBAL DEĞİŞKENLER VE HAFIZA ---
    let API_KEY = localStorage.getItem('gemini_api_key') || "";
    let currentStudyLang = 'de'; // Varsayılan: Almanca
    let selectedText = ""; 
    let vault = JSON.parse(localStorage.getItem('myVault')) || [];
    let isDragging = false; // Havuzda toplu seçim için

    // --- 2. ANA VE ALT SEKME NAVİGASYONU ---
    const setupTabs = () => {
        const navBtns = document.querySelectorAll('.nav-btn');
        const sections = document.querySelectorAll('.tab-section');
        
        navBtns.forEach(btn => btn.addEventListener('click', () => {
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            sections.forEach(s => s.classList.remove('active'));
            
            const targetId = btn.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');
            
            // Havuz sekmesine geçilince listeyi tazele
            if (targetId === 'tab-vocab') renderVault();
        }));

        // Havuz içi Alt Sekmeler (Kelimeler, Gramer, Hafıza)
        const subBtns = document.querySelectorAll('.sub-nav-btn');
        const subSecs = document.querySelectorAll('.sub-section');
        subBtns.forEach(btn => btn.addEventListener('click', () => {
            subBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            subSecs.forEach(s => s.classList.remove('active'));
            document.getElementById(btn.getAttribute('data-sub')).classList.add('active');
        }));
    };

    // --- 3. GEMINI API MOTORU ---
    async function callGemini(prompt) {
    if (!API_KEY) { alert("Lütfen Ayarlar'dan API Key girin!"); return; }

    // v1beta ve gemini-1.5-flash-latest kombinasyonu en garanti yoldur
   const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${API_KEY}`;
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        if (!response.ok) {
            const err = await response.json();
            // Eğer hala v1 hatası veriyorsa burada konsola yazdırırız
            console.error("Detaylı Hata:", err);
            throw new Error(err.error ? err.error.message : "Bağlantı Hatası");
        }
        
        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
    } catch (e) { 
        console.error("Sistem Hatası:", e);
        alert("AI Hatası: " + e.message); 
        return null; 
    }
}

    // --- 4. STÜDYO: HİKAYE ÜRETİMİ VE OTOMATİK AKTARIM ---
    const btnGenerate = document.getElementById('btn-generate-story');
    btnGenerate.addEventListener('click', async () => {
        const promptInput = document.getElementById('story-prompt').value;
        const display = document.getElementById('generated-story-display');
        const labContainer = document.getElementById('text-container');
        
        if (!promptInput) return;

        display.style.display = 'block';
        display.innerText = "Yapay zeka hikayenizi yazıyor...";
        
        const aiPrompt = `Bana ${currentStudyLang === 'de' ? 'Almanca' : 'İngilizce'} dilinde, "${promptInput}" hakkında kısa bir hikaye yaz. Sadece hikaye metnini gönder, başka açıklama yapma.`;
        
        const story = await callGemini(aiPrompt);
        if (story) {
            display.innerText = story; // Stüdyoda göster
            labContainer.innerText = story; // Lab'e aktar
            prepareText(); // Cümle butonlarını ve analizi hazırla
        }
    });

    // --- 5. LABORATUVAR: METİN HAZIRLAMA VE SEÇİM ---
    function prepareText() {
        const labContainer = document.getElementById('text-container');
        const rawText = labContainer.innerText;
        // Metni cümlelere böl
        const sentences = rawText.match(/[^.!?]+[.!?]+/g) || [rawText];
        labContainer.innerHTML = '';

        sentences.forEach(sentText => {
            const sentenceSpan = document.createElement('span');
            sentenceSpan.className = 'sentence-wrapper';
            sentenceSpan.innerText = sentText.trim() + " ";

            // Cümle çeviri ikonu
            const sentBtn = document.createElement('button');
            sentBtn.className = 'sent-trans-btn';
            sentBtn.innerHTML = '<i class="fa-solid fa-language"></i>';
            sentBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                selectedText = sentText.trim();
                showBubbleAtElement(sentBtn, selectedText);
            });
            
            labContainer.appendChild(sentenceSpan);
            labContainer.appendChild(sentBtn);
        });
    }

    // Serbest Seçimi Yakala
    const bubble = document.getElementById('word-bubble');
    document.addEventListener('pointerup', (e) => {
        // Navigasyon veya panel içine tıklandıysa bubble'ı bozma
        if (e.target.closest('.bottom-nav') || e.target.closest('#word-bubble') || e.target.closest('.drawer')) return;

        const selection = window.getSelection();
        const text = selection.toString().trim();

        if (text.length > 0) {
            selectedText = text;
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            
            document.getElementById('bubble-translation').innerText = text;
            bubble.style.left = (rect.left + rect.width / 2) + window.scrollX + 'px';
            bubble.style.top = (rect.top + window.scrollY) + 'px';
            bubble.style.display = 'flex';
        } else {
            bubble.style.display = 'none';
        }
    });

    function showBubbleAtElement(el, text) {
        const rect = el.getBoundingClientRect();
        document.getElementById('bubble-translation').innerText = text;
        bubble.style.left = (rect.left + rect.width / 2) + window.scrollX + 'px';
        bubble.style.top = (rect.top + window.scrollY) + 'px';
        bubble.style.display = 'flex';
    }

    // Gramer Analizi (Çekmece)
    document.getElementById('btn-grammar').addEventListener('click', async () => {
        const drawer = document.getElementById('ai-drawer');
        const content = document.getElementById('ai-response-content');
        drawer.classList.remove('hidden');
        content.innerText = "Gramer analiz ediliyor...";
        
        const analysis = await callGemini(`"${selectedText}" kısmını ${currentStudyLang === 'de' ? 'Almanca' : 'İngilizce'} gramer açısından Türkçe açıkla. Artikel, hal ve yapıları belirt.`);
        if (analysis) content.innerText = analysis;
    });

    // --- 6. HAVUZ MANTIĞI: EKLE / SİL / TOPLU SEÇ ---
    function addToVault() {
        if (!selectedText) return;
        const isDuplicate = vault.some(v => v.text.toLowerCase() === selectedText.toLowerCase());
        if (isDuplicate) {
            alert("Bu zaten havuzda var."); return;
        }
        vault.push({ id: Date.now(), text: selectedText, lang: currentStudyLang });
        localStorage.setItem('myVault', JSON.stringify(vault));
        alert("Kaydedildi!");
    }

    window.deleteWord = (id) => {
        vault = vault.filter(v => v.id !== id);
        localStorage.setItem('myVault', JSON.stringify(vault));
        renderVault();
    };

    function renderVault() {
        const list = document.getElementById('vault-list');
        list.innerHTML = vault.length === 0 ? '<p style="text-align:center; opacity:0.5;">Havuz boş.</p>' : '';
        
        vault.forEach(item => {
            const card = document.createElement('div');
            card.className = 'word-card';
            card.dataset.id = item.id;
            card.innerHTML = `<div><small>${item.lang.toUpperCase()}</small><div>${item.text}</div></div>
                              <button class="mini-btn" onclick="deleteWord(${item.id})"><i class="fa-solid fa-trash"></i></button>`;
            list.appendChild(card);
        });
        checkBulk();
    }

    // Sürükleyerek Seçme (Toplu Silme İçin)
    const vaultList = document.getElementById('vault-list');
    vaultList.addEventListener('pointerdown', (e) => {
        const card = e.target.closest('.word-card');
        if (card) { 
            isDragging = true; 
            card.classList.toggle('to-be-deleted'); 
            checkBulk();
            card.releasePointerCapture(e.pointerId);
        }
    });
    vaultList.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        const card = document.elementFromPoint(e.clientX, e.clientY)?.closest('.word-card');
        if (card && !card.classList.contains('to-be-deleted')) {
            card.classList.add('to-be-deleted');
            checkBulk();
        }
    });
    window.addEventListener('pointerup', () => isDragging = false);

    function checkBulk() {
        const count = document.querySelectorAll('.word-card.to-be-deleted').length;
        document.getElementById('btn-delete-selected').classList.toggle('hidden', count === 0);
    }

    document.getElementById('btn-clear-all').addEventListener('click', () => {
        if (confirm("Tüm havuzu temizlemek istediğinize emin misiniz?")) {
            vault = []; localStorage.setItem('myVault', JSON.stringify(vault)); renderVault();
        }
    });

    document.getElementById('btn-delete-selected').addEventListener('click', () => {
        const selected = document.querySelectorAll('.word-card.to-be-deleted');
        if (confirm(`${selected.length} kelime silinsin mi?`)) {
            const ids = Array.from(selected).map(el => parseInt(el.dataset.id));
            vault = vault.filter(v => !ids.includes(v.id));
            localStorage.setItem('myVault', JSON.stringify(vault));
            renderVault();
        }
    });

    // --- 7. AYARLAR KAYDETME ---
    document.getElementById('btn-save-key').addEventListener('click', () => {
        const key = document.getElementById('api-key-input').value.trim();
        if (key) {
            localStorage.setItem('gemini_api_key', key);
            API_KEY = key;
            alert("API Anahtarı kaydedildi!");
        }
    });
    
    // Tema ve Seslendirme
    document.getElementById('theme-toggle').addEventListener('click', () => document.body.classList.toggle('light-theme'));
    document.getElementById('study-language').addEventListener('change', (e) => currentStudyLang = e.target.value);
    
    document.getElementById('btn-speak').addEventListener('click', (e) => {
        e.stopPropagation();
        const ut = new SpeechSynthesisUtterance(selectedText);
        // Tarayıcıdaki seslerden dile uygun olanı bul
        const voices = window.speechSynthesis.getVoices();
        const targetVoice = voices.find(v => v.lang.startsWith(currentStudyLang));
        if (targetVoice) ut.voice = targetVoice;
        else ut.lang = currentStudyLang === 'de' ? 'de-DE' : 'en-US';
        window.speechSynthesis.speak(ut);
    });

    document.getElementById('btn-save').addEventListener('click', (e) => {
        e.stopPropagation(); addToVault();
    });

    document.getElementById('close-drawer').addEventListener('click', () => {
        document.getElementById('ai-drawer').classList.add('hidden');
    });

    // Başlat
    setupTabs();
    renderVault();
});
