 // ---------- PDF.js init ----------
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    // ---------- DATA & AUTH ----------
    let currentUser = null, isAdmin = false, currentCourseId = null, currentLayoutMode = 0;
    let activeCourseIdForPagination = null, currentPagesArray = [], currentPageIndex = 0;
    let courseEbookContent = {}, courseVideoBlob = {};

    const DEFAULT_COURSES = [
        { id: 1, title: "🐍 Python Programming", desc: "Master Python", icon: "fab fa-python", defaultEbook: "## Chapter 1: Python Basics\n\nPython is an **interpreted**, high-level programming language.\n\n### Readable and Clean\nPython code looks almost like plain English.\n```python\nif age >= 18:\n    print(\"You can vote\")\n```\n\n### Versatile\nPython can be used for:\n- Web Development\n- AI & Machine Learning\n- Data Science\n- Automation\n\n### Large Community\nThousands of free tutorials and libraries.\n\n### Huge Library Ecosystem\n- **NumPy** for numerical computing\n- **Pandas** for data analysis\n- **Django** for web apps\n\n### Cross-Platform\nRuns on Windows, Linux, macOS.", videoSample: "https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4" },
        { id: 2, title: "🌐 Web Dev", desc: "HTML/CSS/JS", icon: "fab fa-html5", defaultEbook: "## Web Development Essentials\n\nHTML provides **structure**.\nCSS brings **style**.\nJavaScript adds **interactivity**.\n\nEnjoy learning!", videoSample: "https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_2mb.mp4" },
        { id: 3, title: "📊 Data Science", desc: "NumPy, Pandas, ML", icon: "fas fa-chart-line", defaultEbook: "## Data Science Fundamentals\n\nData is the new oil.\nLearn to clean, analyze, and visualize data.\n\nPopular tools: **Pandas**, **NumPy**, **Matplotlib**.", videoSample: "https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_3mb.mp4" }
    ];
    let courses = [];

    function loadCourses() { let stored = localStorage.getItem(`elms_courses_${currentUser}`); courses = stored ? JSON.parse(stored) : JSON.parse(JSON.stringify(DEFAULT_COURSES)); saveCourses(); }
    function saveCourses() { if(currentUser) localStorage.setItem(`elms_courses_${currentUser}`, JSON.stringify(courses)); }
    function getNextId() { return courses.length ? Math.max(...courses.map(c=>c.id))+1 : 4; }
    function addCourse(t,d,i,e,v) { courses.push({id:getNextId(), title:t, desc:d, icon:i||"fas fa-book", defaultEbook:e, videoSample:v||"https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_1mb.mp4"}); saveCourses(); renderCoursesGrid(); closeAllModals(); }
    function deleteCourse(id) { courses = courses.filter(c=>c.id!==id); saveCourses(); if(currentCourseId===id) backToCourses(); renderCoursesGrid(); }
    function updateCourseMeta(id,title,desc,icon,video) { let c = courses.find(c=>c.id===id); if(c){ c.title=title; c.desc=desc; c.icon=icon; c.videoSample=video; saveCourses(); if(currentCourseId===id) showCourseDetail(id); renderCoursesGrid(); } }
    function updateCourseEbook(id,newText) { let c = courses.find(c=>c.id===id); if(c){ c.defaultEbook = newText; delete courseEbookContent[id]; saveCourses(); if(currentCourseId===id){ activeCourseIdForPagination=id; currentPagesArray = splitIntoPages(getEbookForCourse(id)); currentPageIndex=0; renderBook(id); } } }
    function getCourseById(id) { return courses.find(c=>c.id===id); }
    function getEbookForCourse(id) { return courseEbookContent[id] || (getCourseById(id)?.defaultEbook || ""); }

    // --- PDF  -----------
    async function extractPDFText(file) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            let fullText = '';
            
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(' ');
                
                // Add page ------
                if (i > 1) fullText += '\n\n';
                fullText += pageText;
            }
            
            // Clean up the text: fix spacing issues common in PDFs-------------------------
            fullText = fullText.replace(/\s+/g, ' ').trim();
            // Try to restore paragraph breaks (double newlines where there seem to be paragraph breaks)
            fullText = fullText.replace(/\. ([A-Z])/g, '.\n\n$1');
            
            return fullText || 'No text could be extracted from this PDF.';
        } catch (error) {
            console.error('PDF extraction error:', error);
            throw new Error('Failed to extract text from PDF. Please make sure it\'s a text-based PDF.');
        }
    }

    // --- Markdown parser---------------- 
    function parseMarkdown(text) {
        if (!text) return '';
        let html = text;
        // Preserve code blocks (```) first
        let codeBlocks = [];
        html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
            let placeholder = `%%CODEBLOCK${codeBlocks.length}%%`;
            codeBlocks.push(`<pre><code>${escapeHtml(code.trimEnd())}</code></pre>`);
            return placeholder;
        });
        // Headings (##, ###)
        html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
        // Bold and italic
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
        // Unordered list items
        html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
        // Wrap consecutive <li> in <ul>
        html = html.replace(/(<li>.*<\/li>)\s*(?=<li>)/g, '$1\n');
        html = html.replace(/((?:<li>.*<\/li>\s*)+)/g, '<ul>$1</ul>');
        // Line breaks and paragraphs
        html = html.replace(/\n\s*\n/g, '</p><p>');
        html = html.replace(/\n/g, '<br>');
        html = '<p>' + html + '</p>';
        // Restore code blocks
        html = html.replace(/%%CODEBLOCK(\d+)%%/g, (m, i) => codeBlocks[i]);
        // Clean empty paragraphs
        html = html.replace(/<p>\s*<\/p>/g, '');
        return html;
    }

    // Split text------------------------
    function splitIntoPages(text, maxLinesPerPage = 35) {
        let blocks = [];
        let codeBlockPattern = /(```[\s\S]*?```)/g;
        let lastIdx = 0;
        let match;
        while ((match = codeBlockPattern.exec(text)) !== null) {
            if (match.index > lastIdx) blocks.push({ type: 'text', content: text.slice(lastIdx, match.index) });
            blocks.push({ type: 'code', content: match[0] });
            lastIdx = codeBlockPattern.lastIndex;
        }
        if (lastIdx < text.length) blocks.push({ type: 'text', content: text.slice(lastIdx) });

        let pages = [], currentPage = '', currentLineCount = 0;
        for (let block of blocks) {
            if (block.type === 'code') {
                let codeLines = block.content.split('\n').length;
                if (currentLineCount + codeLines > maxLinesPerPage && currentPage !== '') {
                    pages.push(currentPage.trimEnd());
                    currentPage = '';
                    currentLineCount = 0;
                }
                currentPage += block.content + '\n\n';
                currentLineCount += codeLines + 1;
            } else {
                let paragraphs = block.content.split(/\n\s*\n/);
                for (let para of paragraphs) {
                    let lines = para.split('\n').length;
                    if (currentLineCount + lines > maxLinesPerPage && currentPage !== '') {
                        pages.push(currentPage.trimEnd());
                        currentPage = '';
                        currentLineCount = 0;
                    }
                    currentPage += para + '\n\n';
                    currentLineCount += lines + 1;
                }
            }
        }
        if (currentPage.trim()) pages.push(currentPage.trimEnd());
        return pages.length ? pages : [text];
    }

    function renderBook(courseId) {
        let container = document.getElementById('dynamicBookContent');
        let indicator = document.getElementById('pageIndicator');
        if (!container) return;
        let fullText = getEbookForCourse(courseId);
        if (activeCourseIdForPagination !== courseId) {
            currentPagesArray = splitIntoPages(fullText);
            currentPageIndex = 0;
            activeCourseIdForPagination = courseId;
        } else {
            let newPages = splitIntoPages(fullText);
            if (JSON.stringify(newPages) !== JSON.stringify(currentPagesArray)) {
                currentPagesArray = newPages;
                currentPageIndex = 0;
            }
        }
        let pageText = currentPagesArray[currentPageIndex] || "End of book.";
        let html = parseMarkdown(pageText);
        container.innerHTML = `<div class="book-content">${html}</div>`;
        if (indicator) indicator.innerText = `📖 Page ${currentPageIndex+1} / ${currentPagesArray.length}`;
    }
    function nextPage() { if (currentPageIndex+1 < currentPagesArray.length) { currentPageIndex++; renderBook(activeCourseIdForPagination); } }
    function prevPage() { if (currentPageIndex > 0) { currentPageIndex--; renderBook(activeCourseIdForPagination); } }

    function showCourseDetail(courseId) {
        currentCourseId = courseId;
        let course = getCourseById(courseId);
        if (!course) return;
        let detailDiv = document.getElementById('courseDetailContent');
        let videoSrc = courseVideoBlob[courseId] || course.videoSample;
        detailDiv.innerHTML = `
            <div class="detail-layout">
                <div class="ebook-area">
                    <div style="font-size:1.2rem; margin-bottom:1rem;"><i class="fas fa-book"></i> 📘 Digital Textbook</div>
                    <div class="book-page"><div id="dynamicBookContent">Loading...</div></div>
                    <div class="pagination"><button class="page-btn" id="prevPageBtn">◀ Prev</button><span id="pageIndicator"></span><button class="page-btn" id="nextPageBtn">Next ▶</button></div>
                    <div class="upload-control">
                        <label class="upload-label" for="ebookUploadInput"><i class="fas fa-upload"></i> Upload TXT</label>
                        <label class="upload-label-pdf" for="pdfUploadInput"><i class="fas fa-file-pdf"></i> Upload PDF</label>
                        <input type="file" id="ebookUploadInput" accept=".txt">
                        <input type="file" id="pdfUploadInput" accept=".pdf">
                        <div class="progress-bar" id="pdfProgressBar"><div class="progress-fill" id="pdfProgressFill"></div></div>
                        <div id="uploadEbookMsg" class="info-text"></div>
                        <div class="upload-hint">📄 Supports .txt and .pdf files (text-based PDFs only)</div>
                    </div>
                </div>
                <div class="video-area">
                    <div style="font-size:1.2rem; margin-bottom:1rem;"><i class="fas fa-video"></i> 🎥 Video Lesson</div>
                    <video id="courseVideoPlayer" controls src="${videoSrc}" style="width:100%; border-radius:20px;"></video>
                    <label class="upload-video-btn" for="videoUploadFile"><i class="fas fa-file-video"></i> Upload own video</label>
                    <input type="file" id="videoUploadFile" accept="video/mp4,video/webm"><div id="videoUploadMsg" class="info-text"></div>
                </div>
            </div>
        `;
        activeCourseIdForPagination = courseId;
        currentPagesArray = splitIntoPages(getEbookForCourse(courseId));
        currentPageIndex = 0;
        renderBook(courseId);
        document.getElementById('prevPageBtn')?.addEventListener('click', prevPage);
        document.getElementById('nextPageBtn')?.addEventListener('click', nextPage);
        setupEbookUpload(courseId);
        setupPDFUpload(courseId);
        setupVideoUpload(courseId);
        applyLayout();
        // Show/hide admin buttons
        document.getElementById('openAdvancedEditorBtn').style.display = isAdmin ? 'inline-block' : 'none';
        document.getElementById('editCourseMetaBtn').style.display = isAdmin ? 'inline-flex' : 'none';
    }

    function setupEbookUpload(cid) {
        let inp = document.getElementById('ebookUploadInput');
        if(!inp) return;
        inp.onchange = (e) => {
            let file = e.target.files[0];
            if(file && file.name.endsWith('.txt')) {
                let reader = new FileReader();
                reader.onload = (ev) => {
                    courseEbookContent[cid] = ev.target.result;
                    activeCourseIdForPagination = cid;
                    currentPagesArray = splitIntoPages(ev.target.result);
                    currentPageIndex = 0;
                    renderBook(cid);
                    let msg = document.getElementById('uploadEbookMsg');
                    if(msg) { msg.innerHTML = '✅ TXT ebook loaded!'; msg.style.color = '#2c5282'; }
                    setTimeout(()=>{if(msg) msg.innerHTML='';},3000);
                };
                reader.readAsText(file);
            } else {
                alert("Please upload a .txt file");
            }
            inp.value = '';
        };
    }

    function setupPDFUpload(cid) {
        let inp = document.getElementById('pdfUploadInput');
        let progressBar = document.getElementById('pdfProgressBar');
        let progressFill = document.getElementById('pdfProgressFill');
        let msg = document.getElementById('uploadEbookMsg');
        
        if(!inp) return;
        inp.onchange = async (e) => {
            let file = e.target.files[0];
            if(file && file.type === 'application/pdf') {
                try {
                    // Show progress
                    if(msg) { msg.innerHTML = '⏳ Extracting text from PDF...'; msg.style.color = '#eab308'; }
                    if(progressBar) progressBar.style.display = 'block';
                    if(progressFill) progressFill.style.width = '50%';
                    
                    const extractedText = await extractPDFText(file);
                    
                    if(progressFill) progressFill.style.width = '100%';
                    
                    courseEbookContent[cid] = extractedText;
                    activeCourseIdForPagination = cid;
                    currentPagesArray = splitIntoPages(extractedText);
                    currentPageIndex = 0;
                    renderBook(cid);
                    
                    if(msg) { msg.innerHTML = `✅ PDF loaded! (${file.name})`; msg.style.color = '#2c5282'; }
                    
                    // Also update the advanced editor if it's open
                    let editorTextarea = document.getElementById('editorRawMarkdown');
                    if(editorTextarea) editorTextarea.value = extractedText;
                } catch (error) {
                    if(msg) { msg.innerHTML = '❌ ' + error.message; msg.style.color = '#dc2626'; }
                } finally {
                    if(progressBar) progressBar.style.display = 'none';
                    if(progressFill) progressFill.style.width = '0%';
                    setTimeout(()=>{if(msg) msg.innerHTML='';},5000);
                }
            } else {
                alert("Please upload a PDF file");
            }
            inp.value = '';
        };
    }

    function setupVideoUpload(cid) {
        let inp = document.getElementById('videoUploadFile');
        let vid = document.getElementById('courseVideoPlayer');
        if(!inp) return;
        inp.onchange = (e) => {
            let file = e.target.files[0];
            if(file && file.type.startsWith('video/')) {
                let url = URL.createObjectURL(file);
                vid.src = url;
                courseVideoBlob[cid] = url;
                let msg = document.getElementById('videoUploadMsg');
                if(msg) { msg.innerText = '✅ Video updated'; }
                setTimeout(()=>{if(msg) msg.innerText='';},2000);
            } else alert("Upload video file");
            inp.value = '';
        };
    }

    function applyLayout() {
        let layoutDiv = document.querySelector('.detail-layout');
        if(!layoutDiv) return;
        layoutDiv.classList.remove('layout-row-reverse','layout-stack');
        if(currentLayoutMode===1) layoutDiv.classList.add('layout-row-reverse');
        else if(currentLayoutMode===2) layoutDiv.classList.add('layout-stack');
    }
    function backToCourses() {
        document.getElementById('coursesView').style.display = 'block';
        document.getElementById('courseDetailView').style.display = 'none';
        renderCoursesGrid();
    }
    function renderCoursesGrid() {
        let grid = document.getElementById('coursesGrid');
        if(!grid) return;
        grid.innerHTML = '';
        courses.forEach(c => {
            let card = document.createElement('div');
            card.className = 'course-card';
            card.innerHTML = `<button class="delete-course" data-id="${c.id}"><i class="fas fa-trash-alt"></i></button><div class="course-icon"><i class="${c.icon}"></i></div><h3>${escapeHtml(c.title)}</h3><p>${escapeHtml(c.desc)}</p><div>📖 Open course →</div>`;
            card.querySelector('.delete-course').onclick = (e) => { e.stopPropagation(); if(confirm('Delete this course?')) deleteCourse(c.id); };
            card.onclick = () => { document.getElementById('coursesView').style.display = 'none'; document.getElementById('courseDetailView').style.display = 'block'; showCourseDetail(c.id); };
            grid.appendChild(card);
        });
    }
    function escapeHtml(str) { return str.replace(/[&<>]/g, m=> m==='&'?'&amp;': m==='<'?'&lt;':'&gt;'); }
    function closeAllModals() { document.querySelectorAll('.modal').forEach(m => m.style.display = 'none'); }

    // --- Advanced Editor logic ---
    document.getElementById('openAdvancedEditorBtn')?.addEventListener('click', () => {
        if (!isAdmin || !currentCourseId) return;
        let rawText = getEbookForCourse(currentCourseId);
        document.getElementById('editorRawMarkdown').value = rawText;
        updatePreview();
        closeAllModals();
        document.getElementById('advancedEditorModal').style.display = 'flex';
    });
    document.getElementById('closeAdvancedEditorBtn')?.addEventListener('click', closeAllModals);
    document.getElementById('editorRawMarkdown')?.addEventListener('input', updatePreview);
    function updatePreview() {
        let md = document.getElementById('editorRawMarkdown').value;
        let preview = document.getElementById('editorPreviewBox');
        preview.innerHTML = parseMarkdown(md);
    }
    document.getElementById('saveAdvancedEbookBtn')?.addEventListener('click', () => {
        let newText = document.getElementById('editorRawMarkdown').value;
        updateCourseEbook(currentCourseId, newText);
        closeAllModals();
    });

    // --- Authentication ---------------
    let users = [];
    const USERS_KEY = 'elms_users_pro';
    function loadUsers() { let stored = localStorage.getItem(USERS_KEY); users = stored ? JSON.parse(stored) : [{ email: "demo@elms.com", password: "demo123" }, { email: "admin@elms.com", password: "admin123" }]; saveUsers(); }
    function saveUsers() { localStorage.setItem(USERS_KEY, JSON.stringify(users)); }
    function login(email,pwd) { let u = users.find(u=>u.email===email && u.password===pwd); if(u) { currentUser=email; isAdmin=(email==="admin@elms.com"); localStorage.setItem('elms_current_user_pro',email); localStorage.setItem('elms_is_admin',isAdmin); return true; } return false; }
    function register(email,pwd) { if(users.find(u=>u.email===email)) return false; users.push({email,password:pwd}); saveUsers(); return true; }
    function logout() { currentUser=null; isAdmin=false; localStorage.removeItem('elms_current_user_pro'); localStorage.removeItem('elms_is_admin'); }
    function checkAutoLogin() { let saved = localStorage.getItem('elms_current_user_pro'); if(saved && users.find(u=>u.email===saved)) { currentUser=saved; isAdmin = localStorage.getItem('elms_is_admin')==='true'; return true; } return false; }
    function showDashboardUI() {
        document.getElementById('authScreen').style.display='none';
        document.getElementById('dashboard').style.display='block';
        document.getElementById('currentUserEmail').innerText=currentUser;
        document.getElementById('adminBadge').style.display = isAdmin ? 'inline-block' : 'none';
        loadCourses(); renderCoursesGrid();
        document.getElementById('coursesView').style.display='block';
        document.getElementById('courseDetailView').style.display='none';
    }
    function showAuthUI() { document.getElementById('authScreen').style.display='flex'; document.getElementById('dashboard').style.display='none'; }

    // --- Event Listeners --------- ---
    document.getElementById('openAddCourseModalBtn').onclick = () => { closeAllModals(); document.getElementById('courseModal').style.display='flex'; };
    document.getElementById('closeModalBtn').onclick = closeAllModals;
    document.getElementById('saveCourseBtn').onclick = () => {
        let title = document.getElementById('newCourseTitle').value.trim();
        let desc = document.getElementById('newCourseDesc').value.trim();
        let icon = document.getElementById('newCourseIcon').value.trim() || "fas fa-book";
        let ebook = document.getElementById('newCourseEbook').value;
        let video = document.getElementById('newCourseVideo').value.trim();
        if(!title) alert("Title required");
        else { addCourse(title, desc, icon, ebook, video); closeAllModals(); }
    };
    document.getElementById('editCourseMetaBtn').onclick = () => { if(isAdmin && currentCourseId) { let c=getCourseById(currentCourseId); if(c){ document.getElementById('editCourseTitle').value=c.title; document.getElementById('editCourseDesc').value=c.desc; document.getElementById('editCourseIcon').value=c.icon; document.getElementById('editCourseVideoUrl').value=c.videoSample; closeAllModals(); document.getElementById('editCourseMetaModal').style.display='flex'; } } };
    document.getElementById('closeMetaModalBtn').onclick = closeAllModals;
    document.getElementById('saveCourseMetaBtn').onclick = () => { let title = document.getElementById('editCourseTitle').value.trim(); if(title && currentCourseId) { updateCourseMeta(currentCourseId, title, document.getElementById('editCourseDesc').value.trim(), document.getElementById('editCourseIcon').value.trim(), document.getElementById('editCourseVideoUrl').value.trim()); closeAllModals(); } };
    document.getElementById('toggleLayoutBtn').onclick = () => { currentLayoutMode = (currentLayoutMode+1)%3; applyLayout(); };
    document.getElementById('backToCoursesBtn').onclick = backToCourses;
    document.getElementById('logoutBtn').onclick = () => { logout(); showAuthUI(); };
    window.onclick = (e) => { if(e.target.classList && e.target.classList.contains('modal')) closeAllModals(); };
    document.addEventListener('keydown', (e) => { if(e.key === 'Escape') closeAllModals(); });

    // Auth UI--------------------
    let isLoginMode = true;
    function setupAuth() {
        let loginBtn = document.getElementById('loginBtn');
        let toggle = document.getElementById('toggleRegister');
        let emailInp = document.getElementById('loginEmail');
        let passInp = document.getElementById('loginPassword');
        let errDiv = document.getElementById('authError');
        function perform() {
            let email = emailInp.value.trim(), pwd = passInp.value.trim();
            if(!email||!pwd) { errDiv.innerText="Fill fields"; return; }
            if(isLoginMode) { if(login(email,pwd)) showDashboardUI(); else errDiv.innerText="Invalid credentials"; }
            else { if(register(email,pwd)) { errDiv.innerText="Account created! Please login."; isLoginMode=true; toggle.innerHTML='New here? <span>Create account</span>'; loginBtn.innerHTML='Login'; } else errDiv.innerText="Email exists."; }
        }
        loginBtn.onclick = perform;
        toggle.onclick = () => { isLoginMode=!isLoginMode; if(isLoginMode){ toggle.innerHTML='New here? <span>Create account</span>'; loginBtn.innerHTML='Login'; } else { toggle.innerHTML='Back to <span>Login</span>'; loginBtn.innerHTML='Register'; } errDiv.innerText=''; };
    }
    loadUsers(); setupAuth();
    if(checkAutoLogin()) showDashboardUI(); else showAuthUI();