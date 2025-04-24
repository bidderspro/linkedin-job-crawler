let allFiles = [];
let currentPage = 1;
let pageSize = 5;
let totalPages = 1;

document.addEventListener('DOMContentLoaded', async () => {
  await refreshFileList();
  
  document.getElementById('startScrape').addEventListener('click', async () => {
    const keyword = document.getElementById('keyword').value;
    const location = document.getElementById('location').value;
    const jobCount = document.getElementById('jobCount').value;
    const timeRange = document.getElementById('timeRange').value;

    if (!keyword || !location) {
      showStatus('Please fill in all fields', 'error');
      return;
    }

    showStatus('Starting scrape...', 'processing');
    
    try {
      const result = await window.electronAPI.startScrape({
        keyword,
        location,
        jobCount: parseInt(jobCount),
        timeRange
      });

      if (result.error) {
        // Check for network errors and provide retry option
        if (result.error.includes('Internet connection error') || 
            result.error.includes('Network error')) {
          showNetworkError(result.error, async () => {
            // Retry the scrape
            showStatus('Retrying...', 'processing');
            await startScrape({
              keyword,
              location,
              jobCount: parseInt(jobCount),
              timeRange
            });
          });
        } else {
          throw new Error(result.error);
        }
      } else {
        showStatus(`Scraped ${result.jobs.length} jobs successfully!`, 'success');
        refreshFileList();
      }
    } catch (error) {
      showStatus(`Error: ${error.message}`, 'error');
    }
  });
});

window.electronAPI.onStatusUpdate = (callback) => {
  window.addEventListener('update-status', (event) => {
    const { message, type } = event.detail;
    callback(message, type);
  });

  window.addEventListener('message', (event) => {
    if (event.data.type === 'update-status') {
      showStatus(event.data.message, event.data.status);
    }
  });
};

async function refreshFileList() {
  console.log("Refreshing file list...");
  allFiles = await window.electronAPI.getFiles();
  console.log(`Got ${allFiles.length} files`);
  
  currentPage = 1;
  
  renderFileList();
}

function renderFileList() {
  const fileList = document.getElementById('fileList');
  const resultsCount = document.getElementById('resultsCount');
  
  if (allFiles.length === 0) {
    fileList.innerHTML = '<div class="no-files">No files found</div>';
    resultsCount.textContent = 'No results';
    
    const existingPagination = document.querySelector('.modern-pagination');
    if (existingPagination) {
      existingPagination.remove();
    }
    return;
  }
  
  resultsCount.textContent = `${allFiles.length} file${allFiles.length !== 1 ? 's' : ''} found`;
  
  totalPages = Math.ceil(allFiles.length / pageSize);
  
  if (currentPage > totalPages) {
    currentPage = totalPages;
  }
  
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, allFiles.length);
  const pageFiles = allFiles.slice(startIndex, endIndex);
  
  fileList.innerHTML = pageFiles.map(file => `
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
  
  createPagination();
}

function createPagination() {
  console.log("Creating pagination...");
  console.log("Total pages:", totalPages);
  console.log("Current page:", currentPage);
  
  const existingPagination = document.querySelector('.modern-pagination');
  if (existingPagination) {
    existingPagination.remove();
  }
  
  if (totalPages <= 1) {
    console.log("Not showing pagination as there's only 1 page or less");
    return;
  }
  
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, allFiles.length);
  
  const paginationContainer = document.createElement('div');
  paginationContainer.className = 'modern-pagination';
  
  paginationContainer.innerHTML = `
    <ul class="pagination mb-0">
      <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
        <a class="page-link" href="#" id="prevPageBtn">
          <i class="bi bi-chevron-left"></i>
        </a>
      </li>
      
      ${currentPage > 2 ? `
        <li class="page-item">
          <a class="page-link" href="#" data-page="1">1</a>
        </li>
      ` : ''}
      
      ${currentPage > 3 ? `
        <li class="page-item disabled">
          <span class="page-link">...</span>
        </li>
      ` : ''}
      
      ${currentPage > 1 ? `
        <li class="page-item">
          <a class="page-link" href="#" data-page="${currentPage - 1}">${currentPage - 1}</a>
        </li>
      ` : ''}
      
      <li class="page-item active">
        <a class="page-link" href="#" data-page="${currentPage}">${currentPage}</a>
      </li>
      
      ${currentPage < totalPages ? `
        <li class="page-item">
          <a class="page-link" href="#" data-page="${currentPage + 1}">${currentPage + 1}</a>
        </li>
      ` : ''}
      
      ${currentPage < totalPages - 2 ? `
        <li class="page-item disabled">
          <span class="page-link">...</span>
        </li>
      ` : ''}
      
      ${currentPage < totalPages - 1 ? `
        <li class="page-item">
          <a class="page-link" href="#" data-page="${totalPages}">${totalPages}</a>
        </li>
      ` : ''}
      
      <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
        <a class="page-link" href="#" id="nextPageBtn">
          <i class="bi bi-chevron-right"></i>
        </a>
      </li>
    </ul>
  `;
  
  console.log("Pagination created, appending to document...");
  
  const fileListContainer = document.querySelector('.file-list-container');
  if (fileListContainer) {
    fileListContainer.appendChild(paginationContainer);
    console.log("Pagination appended to file-list-container");
  } else {
    console.error("Could not find file-list-container, appending to fileList parent");
    const fileList = document.getElementById('fileList');
    fileList.parentNode.appendChild(paginationContainer);
  }
  
  document.getElementById('prevPageBtn').addEventListener('click', (e) => {
    e.preventDefault();
    if (currentPage > 1) {
      currentPage--;
      renderFileList();
    }
  });
  
  document.getElementById('nextPageBtn').addEventListener('click', (e) => {
    e.preventDefault();
    if (currentPage < totalPages) {
      currentPage++;
      renderFileList();
    }
  });
  
  document.querySelectorAll('.page-link[data-page]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const page = parseInt(e.target.dataset.page || e.target.parentElement.dataset.page);
      if (page && page !== currentPage) {
        currentPage = page;
        renderFileList();
      }
    });
  });
}

function showStatus(message, type) {
  const statusBar = document.getElementById('statusBar');
  
  statusBar.style.opacity = '0';
  
  statusBar.textContent = message;
  statusBar.className = `status-bar ${type}`;
  
  setTimeout(() => {
    statusBar.style.opacity = '1';
    
    statusBar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 50);
  
  if (type === 'success') {
    setTimeout(() => {
      statusBar.style.opacity = '0';
    }, 5000);
  }
}

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

// Function to handle network errors with retry capability
function showNetworkError(errorMessage, retryCallback) {
  const statusArea = document.getElementById('statusArea');
  
  // Create network error UI
  statusArea.className = 'error';
  statusArea.innerHTML = `
    <div class="network-error">
      <p><strong>Network Error:</strong> ${errorMessage}</p>
      <p>Make sure you're connected to the internet.</p>
      <button id="retryButton" class="retry-button">Retry Connection</button>
    </div>
  `;
  
  // Add retry button listener
  document.getElementById('retryButton').addEventListener('click', () => {
    if (typeof retryCallback === 'function') {
      retryCallback();
    }
  });
}

// Helper function to start a scrape
async function startScrape(options) {
  try {
    const result = await window.electronAPI.startScrape(options);
    
    if (result.error) {
      throw new Error(result.error);
    }
    
    showStatus(`Scraped ${result.jobs.length} jobs successfully!`, 'success');
    refreshFileList();
    return result;
  } catch (error) {
    showStatus(`Error: ${error.message}`, 'error');
    throw error;
  }
}