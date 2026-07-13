class MindMapCanvas {
  constructor(containerId, svgId, onNodeClick) {
    this.container = document.getElementById(containerId);
    this.svg = document.getElementById(svgId);
    this.onNodeClick = onNodeClick;

    this.panX = 0;
    this.panY = 0;
    this.zoom = 1;
    this.isPanning = false;
    this.startX = 0;
    this.startY = 0;

    this.nodes = [];
    this.connections = [];
    this.draggedNode = null;
    this.dragStartX = 0;
    this.dragStartY = 0;

    this.initEvents();
  }

  initEvents() {
    // Canvas panning mouse events
    this.container.addEventListener('mousedown', (e) => {
      // If clicking directly on a node or its children, don't initiate canvas panning
      if (e.target.closest('.mindmap-node') || e.target.closest('a') || e.target.closest('button')) {
        return;
      }
      this.isPanning = true;
      this.container.style.cursor = 'grabbing';
      this.startX = e.clientX - this.panX;
      this.startY = e.clientY - this.panY;
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isPanning) {
        this.panX = e.clientX - this.startX;
        this.panY = e.clientY - this.startY;
        this.updateTransform();
      } else if (this.draggedNode) {
        // Handle dragging node
        const dx = (e.clientX - this.dragStartX) / this.zoom;
        const dy = (e.clientY - this.dragStartY) / this.zoom;
        
        const paper = this.nodes.find(n => n.id === this.draggedNode.dataset.id);
        if (paper) {
          paper.x = Math.max(50, Math.min(3000, paper.initialX + dx));
          paper.y = Math.max(50, Math.min(3000, paper.initialY + dy));
          this.updateNodePositionDOM(this.draggedNode, paper.x, paper.y);
          this.drawConnections();
        }
      }
    });

    window.addEventListener('mouseup', () => {
      if (this.isPanning) {
        this.isPanning = false;
        this.container.style.cursor = 'grab';
      }
      if (this.draggedNode) {
        const paper = this.nodes.find(n => n.id === this.draggedNode.dataset.id);
        this.draggedNode = null;
        if (paper && window.SPotionApp) {
          window.SPotionApp.saveNodePosition(paper.id, paper.x, paper.y);
        }
      }
    });

    // Canvas zoom mousewheel event
    this.container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomIntensity = 0.05;
      const mouseX = e.clientX - this.container.getBoundingClientRect().left;
      const mouseY = e.clientY - this.container.getBoundingClientRect().top;

      // Calculate world coordinates before zoom
      const worldX = (mouseX - this.panX) / this.zoom;
      const worldY = (mouseY - this.panY) / this.zoom;

      // Adjust zoom level
      if (e.deltaY < 0) {
        this.zoom = Math.min(2.5, this.zoom + zoomIntensity);
      } else {
        this.zoom = Math.max(0.3, this.zoom - zoomIntensity);
      }

      // Readjust pan values so mouse position stays constant relative to zoom point
      this.panX = mouseX - worldX * this.zoom;
      this.panY = mouseY - worldY * this.zoom;

      this.updateTransform();
    }, { passive: false });
  }

  updateTransform() {
    const el = this.container.querySelector('.canvas-workspace') || this.container;
    // Set style directly on a inner wrapping element if exists, or update background position + translate children
    const wrap = this.container.querySelector('#canvas-wrapper');
    if (wrap) {
      wrap.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    }
  }

  setData(papers, connections) {
    this.nodes = JSON.parse(JSON.stringify(papers));
    this.connections = JSON.parse(JSON.stringify(connections));
    this.render();
  }

  render() {
    // Clear wrapper
    let wrap = document.getElementById('canvas-wrapper');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'canvas-wrapper';
      wrap.style.position = 'absolute';
      wrap.style.width = '100%';
      wrap.style.height = '100%';
      wrap.style.transformOrigin = '0 0';
      this.container.appendChild(wrap);
    }
    
    // Put SVG inside wrap if it isn't there already
    if (this.svg.parentElement !== wrap) {
      wrap.appendChild(this.svg);
    }

    // Clear existing HTML nodes from wrap (exclude SVG)
    const existingNodes = wrap.querySelectorAll('.mindmap-node');
    existingNodes.forEach(node => node.remove());

    // Render nodes
    this.nodes.forEach(paper => {
      const nodeEl = document.createElement('div');
      nodeEl.className = 'mindmap-node';
      nodeEl.dataset.id = paper.id;
      nodeEl.style.setProperty('--node-color', paper.color || '#3b82f6');
      
      // Node details
      const title = document.createElement('h4');
      title.innerText = paper.title;
      nodeEl.appendChild(title);

      const category = document.createElement('span');
      category.className = `category-tag category-${paper.category.toLowerCase().replace(/\s+/g, '')}`;
      category.style.marginBottom = '6px';
      category.style.fontSize = '9px';
      category.innerText = paper.category.toUpperCase();
      nodeEl.appendChild(category);

      const summary = document.createElement('p');
      summary.innerText = paper.summary.substring(0, 70) + (paper.summary.length > 70 ? '...' : '');
      nodeEl.appendChild(summary);

      if (paper.link) {
        const link = document.createElement('a');
        link.href = paper.link;
        link.target = '_blank';
        link.className = 'paper-link-btn';
        link.style.marginTop = '8px';
        link.style.display = 'flex';
        link.innerHTML = '🔗 Open Paper';
        // Stop drag propagation on link click
        link.addEventListener('click', (e) => e.stopPropagation());
        nodeEl.appendChild(link);
      }

      this.updateNodePositionDOM(nodeEl, paper.x, paper.y);

      // Event listeners for dragging
      nodeEl.addEventListener('mousedown', (e) => {
        if (e.target.closest('a') || e.target.closest('button')) return;
        e.stopPropagation();
        this.draggedNode = nodeEl;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        const currentPaper = this.nodes.find(n => n.id === paper.id);
        currentPaper.initialX = currentPaper.x;
        currentPaper.initialY = currentPaper.y;
      });

      // Click to view details
      nodeEl.addEventListener('click', (e) => {
        if (e.target.closest('a') || e.target.closest('button')) return;
        this.onNodeClick(paper.id);
      });

      wrap.appendChild(nodeEl);
    });

    this.drawConnections();
    this.updateTransform();
  }

  updateNodePositionDOM(el, x, y) {
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }

  drawConnections() {
    // Dynamically adjust SVG viewport dimensions to span all nodes
    let maxX = 2000;
    let maxY = 1500;
    this.nodes.forEach(n => {
      if (n.x + 300 > maxX) maxX = n.x + 300;
      if (n.y + 200 > maxY) maxY = n.y + 200;
    });

    this.svg.setAttribute('width', maxX);
    this.svg.setAttribute('height', maxY);

    // Clear SVG content and recreate arrow marker defs
    this.svg.innerHTML = `
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 1.5 L 8 5 L 0 8.5 Z" fill="var(--connection-arrow)" />
        </marker>
      </defs>
    `;

    // Draw SVG connections
    this.connections.forEach(conn => {
      const fromNode = this.nodes.find(n => n.id === conn.from);
      const toNode = this.nodes.find(n => n.id === conn.to);

      if (fromNode && toNode) {
        // Center coordinates of node cards
        const fromX = fromNode.x + 110;
        const fromY = fromNode.y + 60;
        const toX = toNode.x + 110;
        const toY = toNode.y + 60;

        const dx = toX - fromX;
        const dy = toY - fromY;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;

        // Calculate boundary offsets based on node dimensions (220x120) with a 12px visibility margin
        const offsetX = (dx / dist) * 122;
        const offsetY = (dy / dist) * 72;

        const startX = fromX + offsetX;
        const startY = fromY + offsetY;
        const endX = toX - offsetX;
        const endY = toY - offsetY;

        // Draw dynamic smooth Bezier curves with arrow heads
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const cx1 = startX + (endX - startX) / 2;
        const cy1 = startY;
        const cx2 = startX + (endX - startX) / 2;
        const cy2 = endY;

        const dAttr = `M ${startX} ${startY} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${endX} ${endY}`;
        path.setAttribute('d', dAttr);
        path.setAttribute('stroke', 'var(--connection-line)');
        path.setAttribute('stroke-width', '1.8');
        path.setAttribute('fill', 'none');
        path.setAttribute('opacity', '1');
        path.setAttribute('marker-end', 'url(#arrow)');

        this.svg.appendChild(path);
      }
    });
  }

  autoCenter() {
    if (this.nodes.length === 0) return;
    
    // Find boundary bounding box
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    
    this.nodes.forEach(n => {
      if (n.x < minX) minX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.x > maxX) maxX = n.x;
      if (n.y > maxY) maxY = n.y;
    });

    const centerX = minX + (maxX - minX) / 2;
    const centerY = minY + (maxY - minY) / 2;

    const rect = this.container.getBoundingClientRect();
    this.zoom = 0.7; // Standard scale to fit
    this.panX = rect.width / 2 - (centerX + 110) * this.zoom;
    this.panY = rect.height / 2 - (centerY + 60) * this.zoom;

    this.updateTransform();
  }

  zoomIn() {
    this.zoom = Math.min(2.5, this.zoom + 0.15);
    this.updateTransform();
  }

  zoomOut() {
    this.zoom = Math.max(0.3, this.zoom - 0.15);
    this.updateTransform();
  }
}

// Expose to global window
window.MindMapCanvas = MindMapCanvas;
