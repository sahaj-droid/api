export class ArtifactPanel {
  constructor() {
    this.panel = document.getElementById('art-panel');
    this.content = document.getElementById('art-content');
    this.title = document.getElementById('art-title');
    this.initEvents();
  }

  initEvents() {
    document.getElementById('art-close').addEventListener('click', () => this.close());
    document.getElementById('art-print').addEventListener('click', () => this.print());
    document.getElementById('art-copy').addEventListener('click', () => this.copy());
  }

  open(htmlContent, titleText = 'Generated Report') {
    this.title.textContent = titleText;
    this.content.innerHTML = htmlContent;
    this.panel.classList.add('open');
  }

  close() {
    this.panel.classList.remove('open');
  }

  print() {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>${this.title.textContent}</title>
          <link rel="stylesheet" href="./styles.css">
          <style>
            body { background: #fff !important; color: #000; padding: 20px; }
            .report-shell { padding: 0; }
            .report-actions { display: none; }
          </style>
        </head>
        <body>
          ${this.content.innerHTML}
          <script>
            setTimeout(() => { window.print(); window.close(); }, 500);
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  async copy() {
    try {
      await navigator.clipboard.writeText(this.content.innerText);
      import('./utils.js').then(module => module.showToast('Content copied to clipboard'));
    } catch(err) {
      alert('Failed to copy text');
    }
  }
}

export const artifactPanel = new ArtifactPanel();
