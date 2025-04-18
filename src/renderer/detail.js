// Get the filename from the URL
const urlParams = new URLSearchParams(window.location.search);
const filename = urlParams.get('file');
let allData = [];
let currentPage = 1;
let pageSize = 10;
let totalPages = 1;

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    if (!filename) {
        showStatus('No file specified!', 'error');
        return;
    }

    document.getElementById('filename').textContent = decodeURIComponent(filename);
    
    try {
        // Load the CSV data
        await loadCsvData();
        
        // Set up event listeners
        document.getElementById('backButton').addEventListener('click', () => {
            window.location.href = 'main.html';
        });
        
        document.getElementById('downloadButton').addEventListener('click', async () => {
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
        });
        
        document.getElementById('prevPage').addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                renderTable();
            }
        });
        
        document.getElementById('nextPage').addEventListener('click', () => {
            if (currentPage < totalPages) {
                currentPage++;
                renderTable();
            }
        });
        
        document.getElementById('pageSize').addEventListener('change', (e) => {
            pageSize = parseInt(e.target.value);
            currentPage = 1;
            calculatePagination();
            renderTable();
        });
    } catch (error) {
        showStatus(`Error: ${error.message}`, 'error');
    }
});

async function loadCsvData() {
    showStatus('Loading data...', 'processing');
    
    try {
        // Load CSV data via IPC
        const result = await window.electronAPI.readCsvFile(filename);
        
        if (result.error) {
            throw new Error(result.error);
        }
        
        allData = result.data;
        
        if (allData.length === 0) {
            throw new Error('No data in file');
        }
        
        // Calculate pagination
        calculatePagination();
        
        // Render the table
        renderTable();
        
        showStatus(`Loaded ${allData.length} records`, 'success');
    } catch (error) {
        showStatus(`Error loading CSV: ${error.message}`, 'error');
        throw error;
    }
}

function calculatePagination() {
    totalPages = Math.ceil(allData.length / pageSize);
    updatePaginationControls();
}

function updatePaginationControls() {
    const prevButton = document.getElementById('prevPage');
    const nextButton = document.getElementById('nextPage');
    const pageInfo = document.getElementById('pageInfo');
    
    prevButton.disabled = currentPage <= 1;
    nextButton.disabled = currentPage >= totalPages;
    
    pageInfo.textContent = `Page ${currentPage} of ${totalPages} (${allData.length} records)`;
}

function renderTable() {
    const tableHeader = document.getElementById('tableHeader');
    const tableBody = document.getElementById('tableBody');
    
    // Clear existing content
    tableHeader.innerHTML = '';
    tableBody.innerHTML = '';
    
    if (allData.length === 0) {
        showStatus('No data to display', 'error');
        return;
    }
    
    // Add headers
    const headers = Object.keys(allData[0]);
    headers.forEach(header => {
        const th = document.createElement('th');
        th.textContent = header;
        tableHeader.appendChild(th);
    });
    
    // Calculate slice for current page
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, allData.length);
    const pageData = allData.slice(startIndex, endIndex);
    
    // Add rows
    pageData.forEach(row => {
        const tr = document.createElement('tr');
        
        headers.forEach(header => {
            const td = document.createElement('td');
            
            // Special handling for links
            if (header === 'link' && row[header].startsWith('http')) {
                const a = document.createElement('a');
                a.href = row[header];
                a.textContent = 'View';
                a.target = '_blank';
                a.addEventListener('click', (e) => {
                    e.preventDefault();
                    window.electronAPI.openExternal(row[header]);
                });
                td.appendChild(a);
            } else {
                td.textContent = row[header] || '';
            }
            
            tr.appendChild(td);
        });
        
        tableBody.appendChild(tr);
    });
    
    updatePaginationControls();
}

function showStatus(message, type) {
    const statusBar = document.getElementById('statusBar');
    statusBar.textContent = message;
    statusBar.className = `status-bar ${type}`;
} 