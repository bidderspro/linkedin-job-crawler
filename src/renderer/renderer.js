// Use the exposed electronAPI from the preload script
document.addEventListener('DOMContentLoaded', async () => {
  // Refresh file list on load
  await refreshFileList();
  
  // Set up form submission
  document.getElementById('startScrape').addEventListener('click', async () => {
    const keyword = document.getElementById('keyword').value;
    const location = document.getElementById('location').value;
    const jobCount = document.getElementById('jobCount').value;

    if (!keyword || !location) {
      showStatus('Please fill in all fields', 'error');
      return;
    }

    showStatus('Starting scrape...', 'processing');
    
    try {
      const result = await window.electronAPI.startScrape({
        keyword,
        location,
        jobCount: parseInt(jobCount)
      });

      if (result.error) throw new Error(result.error);
      
      showStatus(`Scraped ${result.jobs.length} jobs successfully!`, 'success');
      refreshFileList();
    } catch (error) {
      showStatus(`Error: ${error.message}`, 'error');
    }
  });
});

// Status updates from the main process
window.electronAPI.onStatusUpdate = (callback) => {
  window.addEventListener('update-status', (event) => {
    const { message, type } = event.detail;
    callback(message, type);
  });

  // Create a custom event listener for 'update-status'
  window.addEventListener('message', (event) => {
    if (event.data.type === 'update-status') {
      showStatus(event.data.message, event.data.status);
    }
  });
};

async function refreshFileList() {
  const files = await window.electronAPI.getFiles();
  const fileList = document.getElementById('fileList');
  
  if (files.length === 0) {
    fileList.innerHTML = '<div class="no-files">No files found</div>';
    return;
  }
  
  fileList.innerHTML = files.map(file => `
    <div class="file-item">
      <div>
        <span class="file-name">${file.name}</span>
        <span class="file-size">${file.size}</span>
        <span class="file-date">${file.date}</span>
      </div>
      <div class="file-actions">
        <button onclick="viewFile('${file.name}')">View</button>
        <button onclick="downloadFile('${file.name}')">Download</button>
        <button onclick="deleteFile('${file.name}')">Delete</button>
      </div>
    </div>
  `).join('');
}

function showStatus(message, type) {
  const statusBar = document.getElementById('statusBar');
  statusBar.textContent = message;
  statusBar.className = `status-bar ${type}`;
}

// Expose these functions to the HTML
window.deleteFile = (filename) => {
  window.electronAPI.deleteFile(filename);
  refreshFileList();
};

window.downloadFile = async (filename) => {
  showStatus('Saving file...', 'processing');
  try {
    const result = await window.electronAPI.downloadFile(filename);
    
    if (result.error) {
      showStatus(`Error: ${result.error}`, 'error');
    } else if (result.canceled) {
      showStatus('Download canceled', 'processing');
    } else if (result.success) {
      showStatus('File saved successfully', 'success');
    }
  } catch (error) {
    showStatus(`Error: ${error.message}`, 'error');
  }
};

window.viewFile = (filename) => {
  window.location.href = `detail.html?file=${encodeURIComponent(filename)}`;
};