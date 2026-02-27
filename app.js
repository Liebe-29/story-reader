/* ============================================================
   Story Reader — Core Application Logic
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    // --- State ---
    let stories = JSON.parse(localStorage.getItem('storyReader_stories')) || [];
    let addingToStoryId = null; // When adding chapter to existing story

    const $ = id => document.getElementById(id);

    // --- Persistence ---
    function saveState() {
        localStorage.setItem('storyReader_stories', JSON.stringify(stories));
    }

    // ================================================================
    //  NAVIGATION
    // ================================================================

    function navigateTo(viewId) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        $(viewId).classList.add('active');
        window.scrollTo(0, 0);

        // Close any open sheets when navigating
        closeAllSheets();

        // Close reader menu
        $('reader-menu').classList.add('hidden');
    }

    // ================================================================
    //  THEME TOGGLE
    // ================================================================

    function initTheme() {
        const saved = localStorage.getItem('storyReader_theme') || 'dark';
        document.documentElement.setAttribute('data-theme', saved);
        updateThemeBtn(saved);
    }

    function toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('storyReader_theme', next);
        updateThemeBtn(next);
    }

    function updateThemeBtn(theme) {
        const btn = $('theme-btn');
        if (btn) btn.textContent = theme === 'dark' ? '🌙' : '☀️';
    }

    $('theme-btn').addEventListener('click', toggleTheme);
    $('theme-toggle-settings').addEventListener('click', toggleTheme);

    // ================================================================
    //  TEMPLATE PARSER
    // ================================================================
    // Format:
    //   ### 1. Title: [title]
    //   ### 2. English Short Story
    //   [English body text — bold **words** are vocabulary]
    //   ### 3. 重要単語ピックアップ
    //   * **Word**: meaning
    //   ### 4. 日本語訳
    //   [Japanese translation text]

    function parseTemplate(text) {
        const lines = text.split('\n');
        let title = '';
        let englishBody = '';
        let vocabItems = [];
        let translationText = '';
        let currentSection = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            // Detect section headers: ### 1. Title, ### 2. English Short Story, etc.
            // Also support ## headers
            const headerMatch = trimmed.match(/^#{2,3}\s*(\d+)\.\s*(.+)/i);
            if (headerMatch) {
                const sectionNum = parseInt(headerMatch[1]);
                const sectionContent = headerMatch[2].trim();

                if (sectionNum === 1) {
                    // Title section
                    // Extract title from "Title: XXX" or just "Title"
                    const titleMatch = sectionContent.match(/Title[:\s：]+(.+)/i);
                    title = titleMatch ? titleMatch[1].trim() : sectionContent;
                    currentSection = 'title';
                    continue;
                } else if (sectionNum === 2) {
                    currentSection = 'english';
                    continue;
                } else if (sectionNum === 3) {
                    currentSection = 'vocab';
                    continue;
                } else if (sectionNum === 4) {
                    currentSection = 'translation';
                    continue;
                }
            }

            // Also detect alternate Japanese translation header
            if (trimmed.match(/^#{2,3}\s*.*日本語訳/)) {
                currentSection = 'translation';
                continue;
            }

            // Also detect alternate vocab header
            if (trimmed.match(/^#{2,3}\s*.*重要単語/)) {
                currentSection = 'vocab';
                continue;
            }

            // Collect content based on current section
            if (currentSection === 'title') {
                // Lines after title header but before next section → treat as title continuation
                if (trimmed && !title) {
                    title = trimmed;
                }
            } else if (currentSection === 'english') {
                englishBody += line + '\n';
            } else if (currentSection === 'vocab') {
                // Parse * **Word**: meaning   or   - **Word**: meaning
                const vocabMatch = trimmed.match(/^[\*\-]\s*\*\*(.+?)\*\*[:\s：]+(.+)/);
                if (vocabMatch) {
                    vocabItems.push({
                        word: vocabMatch[1].trim(),
                        meaning: vocabMatch[2].trim()
                    });
                }
            } else if (currentSection === 'translation') {
                // Skip sub-headers like "### タイトル：XXX"
                if (trimmed.match(/^#{2,3}\s/)) {
                    // Extract as translation subtitle
                    const subTitle = trimmed.replace(/^#{2,3}\s*/, '').replace(/タイトル[：:]\s*/, '');
                    if (subTitle) {
                        translationText += `**${subTitle}**\n\n`;
                    }
                    continue;
                }
                translationText += line + '\n';
            }
        }

        // Validate: at minimum we need a title and english body
        if (!title || !englishBody.trim()) {
            return null;
        }

        return {
            title: title,
            english: englishBody.trim(),
            vocab: vocabItems,
            translation: translationText.trim()
        };
    }

    // ================================================================
    //  MARKDOWN → HTML (minimal)
    // ================================================================

    function markdownToHtml(text) {
        if (!text) return '';

        let html = text
            // Bold
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            // Italic (single *)
            .replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em>$1</em>')
            // Line breaks → paragraphs
            .split(/\n{2,}/)
            .map(para => `<p>${para.trim()}</p>`)
            .join('\n');

        // Single newlines within paragraphs
        html = html.replace(/(?<!<\/p>)\n(?!<p>)/g, '<br>');

        return html;
    }

    // ================================================================
    //  STORY LIST RENDERING
    // ================================================================

    function renderStoryList() {
        const container = $('story-list');

        if (stories.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📚</div>
                    <p>まだストーリーがありません</p>
                    <p class="empty-sub">下の＋ボタンから追加しましょう</p>
                </div>`;
            return;
        }

        const sortedStories = [...stories].sort((a, b) => b.updatedAt - a.updatedAt);

        container.innerHTML = sortedStories.map(story => {
            const chapterCount = story.chapters.length;
            const dateStr = new Date(story.updatedAt).toLocaleDateString('ja-JP', {
                month: 'short', day: 'numeric'
            });
            return `
                <div class="story-card" data-id="${story.id}">
                    <div class="story-card-title">${escapeHtml(story.title)}</div>
                    <div class="story-card-meta">
                        <span class="chapter-badge">${chapterCount} チャプター</span>
                        <span>${dateStr}</span>
                    </div>
                </div>`;
        }).join('');

        // Click handlers
        container.querySelectorAll('.story-card').forEach(card => {
            card.addEventListener('click', () => {
                openReader(card.dataset.id);
            });
        });
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ================================================================
    //  READER
    // ================================================================

    let currentStoryId = null;
    let currentChapterIndex = 0;

    function openReader(storyId) {
        const story = stories.find(s => s.id === storyId);
        if (!story) return;

        currentStoryId = storyId;
        currentChapterIndex = 0;

        navigateTo('view-reader');
        renderChapter();
    }

    function renderChapter() {
        const story = stories.find(s => s.id === currentStoryId);
        if (!story) return;

        const chapter = story.chapters[currentChapterIndex];
        if (!chapter) return;

        // Title
        $('reader-title').textContent = story.title;

        // Chapter info
        const totalChapters = story.chapters.length;
        if (totalChapters > 1) {
            $('reader-chapter-info').textContent = `Ch. ${currentChapterIndex + 1} / ${totalChapters}`;
        } else {
            $('reader-chapter-info').textContent = '';
        }

        // English text
        $('reader-text').innerHTML = markdownToHtml(chapter.english);

        // Vocabulary
        const vocabContainer = $('vocab-content');
        if (chapter.vocab && chapter.vocab.length > 0) {
            vocabContainer.innerHTML = chapter.vocab.map(v => `
                <div class="vocab-item">
                    <span class="vocab-word">${escapeHtml(v.word)}</span>
                    <span class="vocab-meaning">${escapeHtml(v.meaning)}</span>
                </div>
            `).join('');
        } else {
            vocabContainer.innerHTML = '<p style="color:var(--text-muted);padding:1rem 0;">単語データがありません</p>';
        }

        // Translation
        const transContainer = $('translation-content');
        if (chapter.translation) {
            transContainer.innerHTML = `<div class="translation-text">${markdownToHtml(chapter.translation)}</div>`;
        } else {
            transContainer.innerHTML = '<p style="color:var(--text-muted);padding:1rem 0;">翻訳データがありません</p>';
        }

        // Chapter navigation
        if (totalChapters > 1) {
            $('chapter-nav').classList.remove('hidden');
            $('chapter-indicator').textContent = `${currentChapterIndex + 1} / ${totalChapters}`;
            $('prev-chapter').disabled = currentChapterIndex === 0;
            $('next-chapter').disabled = currentChapterIndex === totalChapters - 1;
        } else {
            $('chapter-nav').classList.add('hidden');
        }

        // Scroll to top
        window.scrollTo(0, 0);
    }

    // Chapter navigation buttons
    $('prev-chapter').addEventListener('click', () => {
        if (currentChapterIndex > 0) {
            currentChapterIndex--;
            renderChapter();
        }
    });

    $('next-chapter').addEventListener('click', () => {
        const story = stories.find(s => s.id === currentStoryId);
        if (story && currentChapterIndex < story.chapters.length - 1) {
            currentChapterIndex++;
            renderChapter();
        }
    });

    // Back button
    $('back-btn').addEventListener('click', () => {
        navigateTo('view-list');
        renderStoryList();
    });

    // ================================================================
    //  READER MENU
    // ================================================================

    $('reader-menu-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        $('reader-menu').classList.toggle('hidden');
    });

    // Close menu when clicking elsewhere
    document.addEventListener('click', (e) => {
        if (!$('reader-menu').contains(e.target) && e.target !== $('reader-menu-btn')) {
            $('reader-menu').classList.add('hidden');
        }
    });

    // Add chapter button
    $('add-chapter-btn').addEventListener('click', () => {
        $('reader-menu').classList.add('hidden');
        openAddView(currentStoryId);
    });

    // Delete story
    $('delete-story-btn').addEventListener('click', () => {
        $('reader-menu').classList.add('hidden');
        if (confirm('このストーリーを削除しますか？')) {
            stories = stories.filter(s => s.id !== currentStoryId);
            saveState();
            navigateTo('view-list');
            renderStoryList();
            showToast('ストーリーを削除しました');
        }
    });

    // ================================================================
    //  BOTTOM SHEETS
    // ================================================================

    const overlay = $('sheet-overlay');

    function openSheet(sheetId) {
        // Close any open sheet first
        closeAllSheets();

        const sheet = $(sheetId);
        if (!sheet) return;

        overlay.classList.remove('hidden');
        // Force reflow
        void overlay.offsetWidth;
        overlay.classList.add('visible');

        sheet.classList.add('open');

        // Mark active tab
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', `sheet-${btn.dataset.sheet}` === sheetId);
        });
    }

    function closeAllSheets() {
        document.querySelectorAll('.bottom-sheet').forEach(s => s.classList.remove('open'));
        overlay.classList.remove('visible');
        setTimeout(() => overlay.classList.add('hidden'), 300);
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    }

    // Tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const sheetId = `sheet-${btn.dataset.sheet}`;
            const sheet = $(sheetId);
            if (sheet && sheet.classList.contains('open')) {
                closeAllSheets();
            } else {
                openSheet(sheetId);
            }
        });
    });

    // Overlay click to close
    overlay.addEventListener('click', closeAllSheets);

    // Handle drag on sheet handles
    document.querySelectorAll('.sheet-handle').forEach(handle => {
        handle.addEventListener('click', () => {
            closeAllSheets();
        });
    });

    // Swipe-down to close bottom sheet
    let touchStartY = 0;
    document.querySelectorAll('.bottom-sheet').forEach(sheet => {
        sheet.addEventListener('touchstart', (e) => {
            touchStartY = e.touches[0].clientY;
        }, { passive: true });

        sheet.addEventListener('touchend', (e) => {
            const touchEndY = e.changedTouches[0].clientY;
            const diff = touchEndY - touchStartY;
            if (diff > 80) { // Swiped down
                closeAllSheets();
            }
        }, { passive: true });
    });

    // ================================================================
    //  ADD / EDIT VIEW
    // ================================================================

    function openAddView(existingStoryId = null) {
        addingToStoryId = existingStoryId;

        if (existingStoryId) {
            const story = stories.find(s => s.id === existingStoryId);
            $('add-view-title').textContent = 'チャプターを追加';
            $('target-story-section').classList.remove('hidden');
            $('target-story-name').textContent = story ? story.title : '';
        } else {
            $('add-view-title').textContent = '新しいストーリー';
            $('target-story-section').classList.add('hidden');
        }

        $('story-input').value = '';
        navigateTo('view-add');
    }

    // FAB button
    $('add-story-fab').addEventListener('click', () => openAddView());

    // Back button from add view
    $('add-back-btn').addEventListener('click', () => {
        if (addingToStoryId) {
            openReader(addingToStoryId);
        } else {
            navigateTo('view-list');
        }
    });

    // Form submit
    $('add-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const input = $('story-input').value.trim();
        if (!input) return;

        const parsed = parseTemplate(input);
        if (!parsed) {
            alert('テンプレートを解析できませんでした。\n\nフォーマット:\n### 1. Title: タイトル\n### 2. English Short Story\n(本文)\n### 3. 重要単語ピックアップ\n* **Word**: 意味\n### 4. 日本語訳\n(翻訳)');
            return;
        }

        const chapter = {
            id: generateId(),
            english: parsed.english,
            vocab: parsed.vocab,
            translation: parsed.translation,
            addedAt: Date.now()
        };

        if (addingToStoryId) {
            // Add chapter to existing story
            const story = stories.find(s => s.id === addingToStoryId);
            if (story) {
                story.chapters.push(chapter);
                story.updatedAt = Date.now();
                saveState();
                showToast(`チャプター ${story.chapters.length} を追加しました`);
                // Go to the new chapter
                currentChapterIndex = story.chapters.length - 1;
                openReader(addingToStoryId);
            }
        } else {
            // Create new story
            const story = {
                id: generateId(),
                title: parsed.title,
                chapters: [chapter],
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            stories.push(story);
            saveState();
            showToast('ストーリーを追加しました！');
            openReader(story.id);
        }
    });

    // ================================================================
    //  SETTINGS VIEW
    // ================================================================

    $('settings-btn').addEventListener('click', () => navigateTo('view-settings'));
    $('settings-back-btn').addEventListener('click', () => {
        navigateTo('view-list');
        renderStoryList();
    });

    // Backup export
    $('backup-export-btn').addEventListener('click', () => {
        const data = {
            stories: stories,
            version: '1.0',
            exportDate: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `story_reader_backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('バックアップをダウンロードしました');
    });

    // Backup import
    $('backup-import-btn').addEventListener('click', () => {
        const fileInput = $('backup-import-file');
        const file = fileInput.files[0];
        if (!file) {
            alert('JSONファイルを選択してください');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (data.stories && Array.isArray(data.stories)) {
                    if (confirm(`${data.stories.length} 件のストーリーをインポートします。現在のデータは上書きされます。よろしいですか？`)) {
                        stories = data.stories;
                        saveState();
                        renderStoryList();
                        navigateTo('view-list');
                        showToast('インポート完了！');
                    }
                } else {
                    alert('無効なバックアップファイルです');
                }
            } catch (err) {
                alert('ファイルの読み込みに失敗しました: ' + err.message);
            }
        };
        reader.readAsText(file);
    });

    // ================================================================
    //  UTILITIES
    // ================================================================

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    }

    function showToast(message) {
        // Remove existing toast
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        document.body.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        }, 2500);
    }

    // ================================================================
    //  INIT
    // ================================================================

    initTheme();
    renderStoryList();
});
