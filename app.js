// SPotion Application Engine
class SPotion {
  constructor() {
    this.papers = [];
    this.connections = [];
    this.team = [];
    this.categoryColors = {};

    this.activeView = "dashboard";
    this.selectedPaperId = null;
    this.activeNotePaperId = null;
    this.isEditingNote = false;
    this.currentTheme = "dark";

    // Modals
    this.activeModal = null;

    // Toast Container
    this.toastContainer = null;

    // MindMap Canvas instance
    this.mindmapCanvas = null;

    this.init();
  }

  init() {
    this.loadState();
    this.setupToastContainer();
    this.initDOM();
    this.bindEvents();
    this.showView(this.activeView);
    this.updateStats();

    // Default theme setup
    document.documentElement.setAttribute('data-theme', this.currentTheme);
  }

  // Load state from localStorage or load defaults
  loadState() {
    const localPapers = localStorage.getItem("spotion_papers");
    const localConnections = localStorage.getItem("spotion_connections");
    const localTeam = localStorage.getItem("spotion_team");
    const localTheme = localStorage.getItem("spotion_theme");

    const defaultData = window.SPotionData || { DEFAULT_PAPERS: [], CONNECTIONS: [], TEAM_MEMBERS: [], CATEGORY_COLORS: {} };

    this.papers = localPapers ? JSON.parse(localPapers) : defaultData.DEFAULT_PAPERS;
    this.team = localTeam ? JSON.parse(localTeam) : defaultData.TEAM_MEMBERS;
    this.categoryColors = defaultData.CATEGORY_COLORS;
    this.currentTheme = localTheme || "dark";

    // Align paper colors, clean up fake comments, update to direct PDF links, and update Survey statuses automatically
    this.papers.forEach(p => {
      if (this.categoryColors[p.category]) {
        p.color = this.categoryColors[p.category];
      }
      if (p.comments) {
        p.comments = p.comments.filter(c => c.author === "Hitesh");
      }
      const defaultPaper = defaultData.DEFAULT_PAPERS.find(dp => dp.id === p.id);
      if (defaultPaper && defaultPaper.link) {
        p.link = defaultPaper.link;
      }
      if (p.category === "Survey" && (p.status === "Bookmarked" || p.status === "Done")) {
        p.status = "Reading";
      }
    });

    // Generate dynamic semantic connections based on paper abstracts and notes
    this.connections = this.generateSemanticConnections();
  }

  saveState() {
    this.connections = this.generateSemanticConnections();
    localStorage.setItem("spotion_papers", JSON.stringify(this.papers));
    localStorage.setItem("spotion_connections", JSON.stringify(this.connections));
    localStorage.setItem("spotion_team", JSON.stringify(this.team));
    localStorage.setItem("spotion_theme", this.currentTheme);
  }

  setupToastContainer() {
    this.toastContainer = document.getElementById("toast-container");
    if (!this.toastContainer) {
      this.toastContainer = document.createElement("div");
      this.toastContainer.id = "toast-container";
      document.body.appendChild(this.toastContainer);
    }
  }

  showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;

    let icon = "ℹ️";
    if (type === "success") icon = "✅";
    if (type === "error") icon = "❌";

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = "slideInRight 0.15s ease reverse forwards";
      setTimeout(() => toast.remove(), 200);
    }, 3000);
  }

  initDOM() {
    // Set up active user widget
    const userWidget = document.querySelector(".user-widget");
    if (userWidget && this.team.length > 0) {
      const activeUser = this.team[0]; // Hitesh is index 0
      userWidget.innerHTML = `
        <div class="user-avatar">${activeUser.avatar}</div>
        <div class="user-info">
          <div class="user-name">${activeUser.name}</div>
          <div class="user-role">${activeUser.role}</div>
        </div>
      `;
    }
  }

  bindEvents() {
    // Navigation routing
    document.querySelectorAll(".nav-item").forEach(item => {
      item.addEventListener("click", (e) => {
        e.preventDefault();
        const targetView = item.dataset.view;
        if (targetView) {
          this.showView(targetView);
        }
      });
    });

    // Theme toggle
    const themeBtn = document.getElementById("theme-toggle");
    if (themeBtn) {
      themeBtn.addEventListener("click", () => {
        this.currentTheme = this.currentTheme === "dark" ? "light" : "dark";
        document.documentElement.setAttribute('data-theme', this.currentTheme);
        themeBtn.innerHTML = this.currentTheme === "dark" ? "🌙" : "☀️";
        this.saveState();
        this.showToast(`Switched to ${this.currentTheme} mode`, "success");
        // Re-draw canvas map as background lines look different
        if (this.activeView === "mindmap" && this.mindmapCanvas) {
          this.mindmapCanvas.drawConnections();
        }
      });
    }

    // Open Add Paper Modal
    const addPaperBtn = document.getElementById("add-paper-btn");
    if (addPaperBtn) {
      addPaperBtn.addEventListener("click", () => this.openModal("add-paper-modal"));
    }

    // Close Modals
    document.querySelectorAll(".modal-close").forEach(btn => {
      btn.addEventListener("click", () => this.closeActiveModal());
    });

    // Cancel modal forms
    document.querySelectorAll(".btn-cancel").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        this.closeActiveModal();
      });
    });

    // Handle Add Paper Form Submit
    const addPaperForm = document.getElementById("add-paper-form");
    if (addPaperForm) {
      addPaperForm.addEventListener("submit", (e) => this.handleAddPaper(e));
    }

    // Search bar global functionality
    const globalSearch = document.getElementById("global-search");
    if (globalSearch) {
      globalSearch.addEventListener("input", (e) => {
        const query = e.target.value;
        if (this.activeView === "library") {
          this.renderLibrary(query);
        } else if (this.activeView === "notes") {
          this.renderNotesSidebar(query);
        }
      });
    }

    // Search filter change
    document.querySelectorAll(".select-filter").forEach(sel => {
      sel.addEventListener("change", () => {
        this.renderLibrary();
      });
    });

    // Export BibTeX
    const exportBtn = document.getElementById("export-bibtex-btn");
    if (exportBtn) {
      exportBtn.addEventListener("click", () => this.exportToBibTeX());
    }

    // Slide-out panel close
    const panelOverlay = document.getElementById("panel-overlay");
    if (panelOverlay) {
      panelOverlay.addEventListener("click", () => this.closeSlidingPanel());
    }
    const panelClose = document.getElementById("panel-close-btn");
    if (panelClose) {
      panelClose.addEventListener("click", () => this.closeSlidingPanel());
    }

    // Post comment trigger
    const postCommentBtn = document.getElementById("post-comment-btn");
    if (postCommentBtn) {
      postCommentBtn.addEventListener("click", () => this.handleAddComment());
    }

    // Note preview toggle tab
    const noteEditBtn = document.getElementById("note-edit-btn");
    const notePreviewBtn = document.getElementById("note-preview-btn");
    if (noteEditBtn && notePreviewBtn) {
      noteEditBtn.addEventListener("click", () => this.setNotesEditMode(true));
      notePreviewBtn.addEventListener("click", () => this.setNotesEditMode(false));
    }

    // Auto save notes on typing keyup
    const noteArea = document.getElementById("notes-editor-area");
    if (noteArea) {
      noteArea.addEventListener("input", () => this.saveActiveNote());
    }

    // Change category from details panel
    const detailCategorySelect = document.getElementById("panel-paper-category-select");
    if (detailCategorySelect) {
      detailCategorySelect.addEventListener("change", (e) => {
        if (!this.selectedPaperId) return;
        const newCat = e.target.value;
        const paper = this.papers.find(p => p.id === this.selectedPaperId);
        if (paper) {
          paper.category = newCat;
          paper.color = this.categoryColors[newCat] || "var(--accent-primary)";
          this.saveState();
          this.showToast(`Category updated to ${newCat}`, "success");
          this.showView(this.activeView);
        }
      });
    }

    // Change status / bookmark from details panel
    const detailStatusSelect = document.getElementById("panel-paper-status-select");
    if (detailStatusSelect) {
      detailStatusSelect.addEventListener("change", (e) => {
        if (!this.selectedPaperId) return;
        const newStatus = e.target.value;
        const paper = this.papers.find(p => p.id === this.selectedPaperId);
        if (paper) {
          paper.status = newStatus;
          this.saveState();
          this.showToast(`Status updated to ${newStatus}`, "success");
          this.showView(this.activeView);
        }
      });
    }

    // Delete paper from details panel
    const deletePaperBtn = document.getElementById("delete-paper-btn");
    if (deletePaperBtn) {
      deletePaperBtn.addEventListener("click", () => {
        if (!this.selectedPaperId) return;
        if (this.selectedPaperId === "paper-root") {
          this.showToast("The foundations root node cannot be deleted.", "error");
          return;
        }
        if (confirm("Are you sure you want to delete this paper? This action cannot be undone.")) {
          this.papers = this.papers.filter(p => p.id !== this.selectedPaperId);
          this.connections = this.connections.filter(c => c.from !== this.selectedPaperId && c.to !== this.selectedPaperId);
          this.saveState();
          this.closeSlidingPanel();
          this.showToast("Paper deleted successfully", "success");
          this.showView(this.activeView);
        }
      });
    }
  }

  showView(viewName) {
    this.activeView = viewName;

    // Update active nav-item
    document.querySelectorAll(".nav-item").forEach(item => {
      if (item.dataset.view === viewName) {
        item.classList.add("active");
      } else {
        item.classList.remove("active");
      }
    });

    // Update active section
    document.querySelectorAll(".view-section").forEach(sec => {
      if (sec.id === `${viewName}-view`) {
        sec.classList.add("active");
      } else {
        sec.classList.remove("active");
      }
    });

    // Load active view content
    switch (viewName) {
      case "dashboard":
        this.renderDashboard();
        break;
      case "library":
        this.renderLibrary();
        break;
      case "mindmap":
        this.renderMindMap();
        break;
      case "notes":
        this.renderNotesWorkspace();
        break;
      case "timeline":
        this.renderTimeline();
        break;
    }

    // Reset global search display if not library/notes
    const globalSearch = document.getElementById("global-search");
    if (globalSearch && viewName !== "library" && viewName !== "notes") {
      globalSearch.value = "";
    }
  }

  updateStats() {
    this.saveState();

    const totalPapers = this.papers.length;
    const readingPapers = this.papers.filter(p => p.status === "Reading").length;
    const reviewPapers = this.papers.filter(p => p.status === "In Review").length;
    const bookmarkedPapers = this.papers.filter(p => p.status === "Bookmarked").length;

    // Update dashboard header stats counts
    const totalCountDom = document.getElementById("stat-total-papers");
    const activeCountDom = document.getElementById("stat-active-reading");
    const bookmarkedCountDom = document.getElementById("stat-bookmarked");

    if (totalCountDom) totalCountDom.innerText = totalPapers;
    if (activeCountDom) activeCountDom.innerText = readingPapers + reviewPapers;
    if (bookmarkedCountDom) bookmarkedCountDom.innerText = bookmarkedPapers;
  }

  // Dashboard Renderer
  renderDashboard() {
    this.updateStats();

    // Calculate reading distribution
    const statuses = ["Done", "Reading", "In Review", "Bookmarked"];
    const progressList = document.getElementById("dashboard-progress-list");
    if (progressList) {
      progressList.innerHTML = "";
      statuses.forEach(status => {
        const count = this.papers.filter(p => p.status === status).length;
        const pct = this.papers.length > 0 ? Math.round((count / this.papers.length) * 100) : 0;

        // Pick visual color
        let color = "var(--accent-primary)";
        if (status === "Done") color = "var(--accent-success)";
        if (status === "In Review") color = "var(--accent-secondary)";
        if (status === "Bookmarked") color = "var(--accent-warning)";

        progressList.innerHTML += `
          <div class="progress-row">
            <div class="progress-label-row">
              <span>${status}</span>
              <strong>${count} (${pct}%)</strong>
            </div>
            <div class="progress-bar-bg">
              <div class="progress-bar-fill" style="width: ${pct}%; background: ${color}"></div>
            </div>
          </div>
        `;
      });
    }
  }

  // Library Renderer
  renderLibrary(searchQuery = "") {
    const grid = document.getElementById("papers-grid");
    if (!grid) return;

    grid.innerHTML = "";

    // Filters
    const categoryFilter = document.getElementById("filter-category")?.value || "all";
    const statusFilter = document.getElementById("filter-status")?.value || "all";

    // Filtering logic
    const filteredPapers = this.papers.filter(p => {
      // Category match
      if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
      // Status match
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      // Search match
      if (searchQuery.trim() !== "") {
        const q = searchQuery.toLowerCase();
        const inTitle = p.title.toLowerCase().includes(q);
        const inSummary = p.summary.toLowerCase().includes(q);
        const inAuthors = p.authors?.toLowerCase().includes(q);
        const inVenue = p.venue?.toLowerCase().includes(q);
        return inTitle || inSummary || inAuthors || inVenue;
      }
      return true;
    });

    if (filteredPapers.length === 0) {
      grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-dim); padding: 48px;">No papers match the selected criteria. Try another search/filter!</div>`;
      return;
    }

    filteredPapers.forEach(paper => {
      const card = document.createElement("div");
      card.className = "paper-card";

      // Status badge class
      let statusClass = "badge-reading";
      if (paper.status === "Done") statusClass = "badge-done";
      if (paper.status === "In Review") statusClass = "badge-review";
      if (paper.status === "Bookmarked") statusClass = "badge-bookmarked";

      card.innerHTML = `
        <div class="paper-card-header">
          <span class="category-tag category-${paper.category.toLowerCase().replace(/\s+/g, '')}">${paper.category}</span>
          <span class="badge ${statusClass}">${paper.status}</span>
        </div>
        <h3 class="paper-title">${paper.title}</h3>
        <p class="paper-authors">${paper.authors || "Unknown Authors"}</p>
        <p class="paper-summary">${paper.summary}</p>
        <div class="paper-card-footer">
          <span class="paper-meta-details">${paper.venue || "arXiv"} • ${paper.year}</span>
          ${paper.link ? `<a href="${paper.link}" target="_blank" class="paper-link-btn" onclick="event.stopPropagation();">🔗 Link</a>` : ''}
        </div>
      `;

      card.addEventListener("click", () => this.openSlidingPanel(paper.id));
      grid.appendChild(card);
    });
  }

  // Sliding Details Panel
  openSlidingPanel(paperId) {
    this.selectedPaperId = paperId;
    const paper = this.papers.find(p => p.id === paperId);
    if (!paper) return;

    // Fill elements
    const titleDom = document.getElementById("panel-paper-title");
    const summaryDom = document.getElementById("panel-paper-summary");
    const authorsDom = document.getElementById("panel-paper-authors");
    const detailsDom = document.getElementById("panel-paper-details");
    const commentsList = document.getElementById("panel-comments-list");

    const catSelect = document.getElementById("panel-paper-category-select");
    const statusSelect = document.getElementById("panel-paper-status-select");
    if (catSelect) catSelect.value = paper.category;
    if (statusSelect) statusSelect.value = paper.status;

    if (titleDom) titleDom.innerText = paper.title;
    if (summaryDom) summaryDom.innerText = paper.summary;
    if (authorsDom) authorsDom.innerText = paper.authors || "Unknown Authors";

    if (detailsDom) {
      detailsDom.innerHTML = `
        <div><strong>Category:</strong> ${paper.category}</div>
        <div><strong>Published Year:</strong> ${paper.year}</div>
        <div><strong>Venue:</strong> ${paper.venue || "N/A"}</div>
        <div><strong>Status:</strong> ${paper.status}</div>
      `;
    }

    // Render Comments
    if (commentsList) {
      commentsList.innerHTML = "";
      if (!paper.comments || paper.comments.length === 0) {
        commentsList.innerHTML = `<div style="text-align:center; color:var(--text-dim); font-size:12px; padding:12px;">No comments. Start the discussion!</div>`;
      } else {
        paper.comments.forEach(c => {
          commentsList.innerHTML += `
            <div class="comment-card">
              <div class="comment-header">
                <span class="comment-author">${c.author}</span>
                <span>${this.formatDate(new Date(c.date))}</span>
              </div>
              <div>${c.text}</div>
            </div>
          `;
        });
      }
    }

    // Display sliding panel
    document.getElementById("panel-overlay")?.classList.add("show");
    document.getElementById("paper-detail-panel")?.classList.add("open");
  }

  closeSlidingPanel() {
    document.getElementById("panel-overlay")?.classList.remove("show");
    document.getElementById("paper-detail-panel")?.classList.remove("open");
    this.selectedPaperId = null;
  }

  handleAddComment() {
    if (!this.selectedPaperId) return;
    const txtBox = document.getElementById("panel-comment-input");
    const text = txtBox?.value.trim();
    if (!text) return;

    const paper = this.papers.find(p => p.id === this.selectedPaperId);
    if (paper) {
      if (!paper.comments) paper.comments = [];

      paper.comments.push({
        id: "comment-" + Date.now(),
        author: "Hitesh", // Default active poster
        text: text,
        date: new Date().toISOString()
      });

      this.saveState();
      txtBox.value = "";
      this.openSlidingPanel(this.selectedPaperId); // Refresh details pane
      this.showToast("Comment logged!", "success");
    }
  }

  // Modals
  openModal(modalId) {
    this.activeModal = document.getElementById(modalId);
    if (this.activeModal) {
      this.activeModal.classList.add("show");
      document.getElementById("panel-overlay")?.classList.add("show");
    }
  }

  closeActiveModal() {
    if (this.activeModal) {
      this.activeModal.classList.remove("show");
      this.activeModal = null;
    }
    // Only remove overlay if sliding panel is also closed
    const detailPanel = document.getElementById("paper-detail-panel");
    if (!detailPanel || !detailPanel.classList.contains("open")) {
      document.getElementById("panel-overlay")?.classList.remove("show");
    }
  }

  handleAddPaper(e) {
    e.preventDefault();

    const title = document.getElementById("paper-title-input")?.value.trim();
    const category = document.getElementById("paper-category-input")?.value;
    const summary = document.getElementById("paper-summary-input")?.value.trim();
    const year = parseInt(document.getElementById("paper-year-input")?.value) || 2026;
    const venue = document.getElementById("paper-venue-input")?.value.trim() || "ArXiv";
    const authors = document.getElementById("paper-authors-input")?.value.trim() || "Unknown";
    const link = document.getElementById("paper-link-input")?.value.trim();
    const status = document.getElementById("paper-status-input")?.value || "Reading";

    if (!title || !category || !summary) {
      this.showToast("Please fill in Title, Category, and Summary!", "error");
      return;
    }

    const newId = "paper-" + Date.now();

    // Allocate position on Canvas (random coordinates around central area)
    const x = Math.floor(Math.random() * 500) + 700;
    const y = Math.floor(Math.random() * 400) + 400;

    const color = this.categoryColors[category] || "var(--accent-primary)";

    const newPaper = {
      id: newId,
      title,
      category,
      summary,
      link,
      x,
      y,
      color,
      year,
      authors,
      venue,
      status,
      notes: `# ${title}\n\nAdd your detailed reading notes here.`,
      comments: []
    };

    // Add to library
    this.papers.push(newPaper);

    // Create automatic connection from root node to the new paper node
    // Search for root node
    const root = this.papers.find(p => p.id === "paper-root");
    if (root) {
      this.connections.push({ from: "paper-root", to: newId });
    }

    this.saveState();
    this.closeActiveModal();
    this.showToast("Research Paper Added Successfully!", "success");

    // Clean form
    document.getElementById("add-paper-form")?.reset();

    // Reload active view
    this.showView(this.activeView);
  }

  saveNodePosition(paperId, x, y) {
    const paper = this.papers.find(p => p.id === paperId);
    if (paper) {
      paper.x = x;
      paper.y = y;
      this.saveState();
    }
  }

  // Mind Map Renderer
  renderMindMap() {
    if (!this.mindmapCanvas) {
      this.mindmapCanvas = new window.MindMapCanvas(
        "mindmap-canvas-container",
        "mindmap-svg-element",
        (id) => this.openSlidingPanel(id)
      );

      // Wire zoom button clicks
      document.getElementById("zoom-in-btn")?.addEventListener("click", () => this.mindmapCanvas.zoomIn());
      document.getElementById("zoom-out-btn")?.addEventListener("click", () => this.mindmapCanvas.zoomOut());
      document.getElementById("zoom-center-btn")?.addEventListener("click", () => this.mindmapCanvas.autoCenter());
    }

    this.mindmapCanvas.setData(this.papers, this.connections);
    setTimeout(() => this.mindmapCanvas.autoCenter(), 100);
  }

  // Notes Workspace
  renderNotesWorkspace() {
    this.renderNotesSidebar();

    // Auto-select first paper if nothing is active
    if (!this.activeNotePaperId && this.papers.length > 0) {
      this.activeNotePaperId = this.papers[0].id;
    }

    this.loadNotesEditor();
  }

  renderNotesSidebar(query = "") {
    const listDom = document.getElementById("notes-paper-list");
    if (!listDom) return;

    listDom.innerHTML = "";

    const q = query.toLowerCase();
    const filtered = this.papers.filter(p => p.title.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));

    filtered.forEach(p => {
      const item = document.createElement("div");
      item.className = `notes-paper-item ${p.id === this.activeNotePaperId ? 'active' : ''}`;
      item.innerHTML = `
        <div class="notes-paper-item-title">${p.title}</div>
        <div class="notes-paper-item-desc">${p.category} • ${p.status}</div>
      `;

      item.addEventListener("click", () => {
        this.activeNotePaperId = p.id;
        this.renderNotesSidebar(query);
        this.loadNotesEditor();
      });

      listDom.appendChild(item);
    });
  }

  loadNotesEditor() {
    const paper = this.papers.find(p => p.id === this.activeNotePaperId);
    const titleDom = document.getElementById("active-note-title");
    const editArea = document.getElementById("notes-editor-area");
    const previewArea = document.getElementById("notes-preview-area");

    if (!paper) {
      if (titleDom) titleDom.innerText = "No paper selected";
      if (editArea) editArea.value = "";
      if (previewArea) previewArea.innerHTML = "";
      return;
    }

    if (titleDom) titleDom.innerText = paper.title;
    if (editArea) editArea.value = paper.notes || "";

    this.setNotesEditMode(this.isEditingNote);
  }

  setNotesEditMode(isEdit) {
    this.isEditingNote = isEdit;

    const editArea = document.getElementById("notes-editor-area");
    const previewArea = document.getElementById("notes-preview-area");
    const editBtn = document.getElementById("note-edit-btn");
    const previewBtn = document.getElementById("note-preview-btn");

    if (isEdit) {
      if (editArea) editArea.style.display = "block";
      if (previewArea) previewArea.classList.remove("active");
      editBtn?.classList.add("btn-primary");
      previewBtn?.classList.remove("btn-primary");
    } else {
      if (editArea) editArea.style.display = "none";
      if (previewArea) {
        previewArea.classList.add("active");
        this.renderNotesPreview();
      }
      editBtn?.classList.remove("btn-primary");
      previewBtn?.classList.add("btn-primary");
    }
  }

  saveActiveNote() {
    if (!this.activeNotePaperId) return;
    const text = document.getElementById("notes-editor-area")?.value;
    const paper = this.papers.find(p => p.id === this.activeNotePaperId);
    if (paper) {
      paper.notes = text;
      this.saveState();
    }
  }

  renderNotesPreview() {
    const paper = this.papers.find(p => p.id === this.activeNotePaperId);
    const preview = document.getElementById("notes-preview-area");
    if (!paper || !preview) return;

    // Simple Client-side Markdown Parser
    let html = paper.notes || "*No notes recorded yet.*";

    // Escaping html tags safely first
    html = html
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Headings
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');

    // Code blocks
    html = html.replace(/```([\s\S]*?)```/gim, '<pre><code>$1</code></pre>');

    // Bold
    html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');

    // Bullets
    html = html.replace(/^\- (.*$)/gim, '<li>$1</li>');
    // Wrap consecutive list items in <ul> tags
    html = html.replace(/(<li>.*<\/li>)/gim, '<ul>$1</ul>');
    // Clean redundant nested <ul>s
    html = html.replace(/<\/ul>\s*<ul>/g, '');

    // Paragraph breaks
    html = html.split('\n\n').map(p => {
      if (p.trim().startsWith('<h') || p.trim().startsWith('<ul') || p.trim().startsWith('<li') || p.trim().startsWith('<pre')) {
        return p;
      }
      return `<p>${p.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');

    preview.innerHTML = html;
  }

  // Timeline Renderer
  renderTimeline() {
    const listDom = document.getElementById("timeline-list");
    if (!listDom) return;

    listDom.innerHTML = "";

    // Group papers by Year
    const sorted = [...this.papers].sort((a, b) => b.year - a.year);

    if (sorted.length === 0) {
      listDom.innerHTML = `<div style="text-align:center;color:var(--text-dim);margin:64px;">No papers found. Add papers to view timeline!</div>`;
      return;
    }

    sorted.forEach(paper => {
      const item = document.createElement("div");
      item.className = "timeline-item";

      // Status badge class
      let statusClass = "badge-reading";
      if (paper.status === "Done") statusClass = "badge-done";
      if (paper.status === "In Review") statusClass = "badge-review";
      if (paper.status === "Bookmarked") statusClass = "badge-bookmarked";

      item.innerHTML = `
        <div class="timeline-dot"></div>
        <div class="timeline-card">
          <div class="timeline-year">${paper.year}</div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span class="category-tag category-${paper.category.toLowerCase().replace(/\s+/g, '')}">${paper.category}</span>
            <span class="badge ${statusClass}">${paper.status}</span>
          </div>
          <h3 class="paper-title">${paper.title}</h3>
          <p class="paper-authors">${paper.authors || "Unknown Authors"}</p>
          <div style="font-size:12px; color:var(--text-dim); margin-top:8px;">
            Venue: <strong>${paper.venue || "N/A"}</strong>
          </div>
        </div>
      `;

      item.querySelector(".timeline-card").addEventListener("click", () => this.openSlidingPanel(paper.id));
      listDom.appendChild(item);
    });
  }

  // Export BibTeX utility
  exportToBibTeX() {
    if (this.papers.length === 0) {
      this.showToast("No papers in database to export!", "error");
      return;
    }

    let bibtex = "";
    this.papers.forEach(p => {
      if (p.id === "paper-root") return; // skip root node placeholder

      const citationKey = p.authors
        ? p.authors.split(',')[0].trim().replace(/\s/g, '').toLowerCase() + p.year
        : `paper${p.id.split('-')[1]}`;

      bibtex += `@article{${citationKey},\n`;
      bibtex += `  title = {${p.title}},\n`;
      bibtex += `  author = {${p.authors || "Unknown"}},\n`;
      bibtex += `  year = {${p.year}},\n`;
      bibtex += `  journal = {${p.venue || "arXiv"}},\n`;
      if (p.link) bibtex += `  url = {${p.link}},\n`;
      bibtex += `  note = {${p.summary.replace(/\n/g, ' ')}}\n`;
      bibtex += `}\n\n`;
    });

    // Download file
    const blob = new Blob([bibtex], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "spotion_citations.bib";
    link.click();
    this.showToast("BibTeX library exported!", "success");
  }

  // Generate dynamic semantic connections based on paper abstracts and notes
  generateSemanticConnections() {
    const connections = [];
    const papers = this.papers;
    
    papers.forEach(p => {
      if (p.id === "paper-root") return;
      
      const title = p.title.toLowerCase();
      const summary = p.summary.toLowerCase();
      const notes = (p.notes || "").toLowerCase();
      const text = `${title} ${summary} ${notes}`;
      
      let connected = false;
      
      // Rule 1: Connect optimization/ViT papers to the main ViT paper (paper-10)
      if (p.id !== "paper-10" && (text.includes("vit") || text.includes("vision transformer") || text.includes("quantization") || text.includes("ssm"))) {
        const vitPaper = papers.find(dp => dp.id === "paper-10");
        if (vitPaper) {
          connections.push({ from: "paper-10", to: p.id });
          connected = true;
        }
      }
      
      // Rule 2: Connect masked reconstruction optimization to Point-UMAE (paper-11)
      if (!connected && p.id !== "paper-11" && (text.includes("masked") || text.includes("autoencoder") || text.includes("reconstruction"))) {
        const maePaper = papers.find(dp => dp.id === "paper-11");
        if (maePaper) {
          connections.push({ from: "paper-11", to: p.id });
          connected = true;
        }
      }
      
      // Rule 3: Connect domain adaptation / arbitrary scenarios to JEPA (paper-3)
      if (!connected && p.id !== "paper-3" && (text.includes("domain") || text.includes("scenario") || text.includes("adaptation") || text.includes("generaliz"))) {
        const jepaPaper = papers.find(dp => dp.id === "paper-3");
        if (jepaPaper) {
          connections.push({ from: "paper-3", to: p.id });
          connected = true;
        }
      }

      // Rule 4: Connect Future/Applications (Robotics, Odometry, Perceptual) to Edge AI (paper-14)
      if (!connected && p.id !== "paper-14" && (text.includes("robot") || text.includes("odometry") || text.includes("edge ai") || text.includes("device"))) {
        const edgePaper = papers.find(dp => dp.id === "paper-14");
        if (edgePaper) {
          connections.push({ from: "paper-14", to: p.id });
          connected = true;
        }
      }
      
      // Fallback: Connect directly from the central Root
      if (!connected) {
        connections.push({ from: "paper-root", to: p.id });
      }
    });
    
    return connections;
  }

  // Helper date formatting
  formatDate(date) {
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return "Just now";
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(diff / 3600000);
    if (hours < 24) return `${hours} hours ago`;

    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }
}

// Instantiate application on page load
window.addEventListener("load", () => {
  window.SPotionApp = new SPotion();
});
