// Get the filename from the URL
const urlParams = new URLSearchParams(window.location.search);
const filename = urlParams.get('file');
let allData = [];
let currentPage = 1;
let pageSize = 10; // Default to 10 records per page
let totalPages = 1;
let viewCounts = {};

// Initialize the page
document.addEventListener('DOMContentLoaded', async () => {
    if (!filename) {
        showStatus('No file specified!', 'error');
        return;
    }

    document.getElementById('filename').textContent = decodeURIComponent(filename);
    
    try {
        // Load view counts from localStorage
        const storedCounts = localStorage.getItem(`viewCounts_${filename}`);
        if (storedCounts) {
            viewCounts = JSON.parse(storedCounts);
            console.log('Loaded view counts:', viewCounts);
        }
        
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
        
        // Replace the old pagination controls with modern pagination
        createModernPagination();
        
    } catch (error) {
        showStatus(`Error: ${error.message}`, 'error');
    }
});

// Create modern pagination controls
function createModernPagination() {
    // Remove old pagination controls
    const oldPagination = document.querySelector('.pagination');
    if (oldPagination) {
        oldPagination.remove();
    }
    
    // Create new modern pagination div
    const modernPagination = document.createElement('div');
    modernPagination.className = 'modern-pagination';
    
    // Insert after the table-container
    const tableContainer = document.querySelector('.table-container');
    if (tableContainer.nextSibling) {
        tableContainer.parentNode.insertBefore(modernPagination, tableContainer.nextSibling);
    } else {
        tableContainer.parentNode.appendChild(modernPagination);
    }
    
    // Update pagination UI
    updateModernPagination();
}

// Update the modern pagination UI
function updateModernPagination() {
    const modernPagination = document.querySelector('.modern-pagination');
    if (!modernPagination) return;
    
    const startIndex = (currentPage - 1) * pageSize + 1;
    const endIndex = Math.min(currentPage * pageSize, allData.length);
    
    modernPagination.innerHTML = `
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
    
    // Add event listeners to new pagination controls
    document.getElementById('prevPageBtn').addEventListener('click', (e) => {
        e.preventDefault();
        if (currentPage > 1) {
            currentPage--;
            renderTable();
            updateModernPagination();
        }
    });
    
    document.getElementById('nextPageBtn').addEventListener('click', (e) => {
        e.preventDefault();
        if (currentPage < totalPages) {
            currentPage++;
            renderTable();
            updateModernPagination();
        }
    });
    
    // Add event listeners to page number links
    document.querySelectorAll('.page-link[data-page]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const page = parseInt(e.target.dataset.page);
            if (page && page !== currentPage) {
                currentPage = page;
                renderTable();
                updateModernPagination();
            }
        });
    });
}

// Save view counts to localStorage
function saveViewCounts() {
    localStorage.setItem(`viewCounts_${filename}`, JSON.stringify(viewCounts));
    console.log('Saved view counts:', viewCounts);
}

// Check if a job is recently posted (within the last 7 days)
function isRecentJob(dateString) {
    if (!dateString || dateString === 'Not available') return false;
    
    try {
        const jobDate = new Date(dateString);
        if (isNaN(jobDate.getTime())) return false;
        
        const now = new Date();
        const daysDiff = Math.floor((now - jobDate) / (1000 * 60 * 60 * 24));
        return daysDiff <= 7;
    } catch (error) {
        console.error('Error parsing date:', error);
        return false;
    }
}

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
    // Use modern pagination update instead
    if (document.querySelector('.modern-pagination')) {
        updateModernPagination();
    } else {
        updatePaginationControls();
    }
}

function updatePaginationControls() {
    const prevButton = document.getElementById('prevPage');
    const nextButton = document.getElementById('nextPage');
    const pageInfo = document.getElementById('pageInfo');
    
    if (!prevButton || !nextButton || !pageInfo) return;
    
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
    
    // Define mandatory columns and preferred column order
    const mandatoryColumns = ['title', 'company', 'location', 'postedDate', 'link'];
    const preferredOrder = ['title', 'company', 'location', 'postedDate', 'applicationsCount', 'link'];
    const allHeaders = Object.keys(allData[0]);
    
    // Ensure data has the postedDate field
    if (!allHeaders.includes('postedDate')) {
        console.log('Adding missing postedDate field to job data');
        allData.forEach(job => {
            if (!job.postedDate) {
                job.postedDate = job.date ? job.date.split('T')[0] : 'Not available';
            }
        });
    }
    
    // Create a sorted set of headers with mandatory and preferred ones first
    const sortedHeaders = [
        // First include all mandatory columns that exist in the data
        ...mandatoryColumns.filter(h => allHeaders.includes(h) || h === 'postedDate'),
        // Then include other preferred columns
        ...preferredOrder.filter(h => !mandatoryColumns.includes(h) && allHeaders.includes(h)),
        // Then any remaining columns except 'date' which is redundant
        ...allHeaders.filter(h => !preferredOrder.includes(h) && h !== 'date')
    ];
    
    // Remove duplicates from sortedHeaders
    const uniqueHeaders = [...new Set(sortedHeaders)];
    
    console.log('Table headers:', uniqueHeaders);
    
    // Add headers
    uniqueHeaders.forEach(header => {
        const th = document.createElement('th');
        
        // Render more user-friendly header names
        let displayHeader = header;
        if (header === 'postedDate') displayHeader = 'Posted Date';
        if (header === 'applicationsCount') displayHeader = 'Applications';
        
        th.textContent = displayHeader.charAt(0).toUpperCase() + displayHeader.slice(1);
        tableHeader.appendChild(th);
    });
    
    // Calculate slice for current page
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, allData.length);
    const pageData = allData.slice(startIndex, endIndex);
    
    // Add rows
    pageData.forEach((row, index) => {
        const tr = document.createElement('tr');
        
        // Check if the job is recent
        const isRecent = isRecentJob(row.postedDate);
        if (isRecent) {
            tr.classList.add('recent-job');
        }
        
        uniqueHeaders.forEach(header => {
            const td = document.createElement('td');
            
            // Special handling for title column and recent jobs
            if (header === 'title') {
                // Create title content with green dot for recent jobs
                if (isRecent) {
                    const wrapper = document.createElement('div');
                    wrapper.className = 'title-with-indicator';
                    
                    const dot = document.createElement('span');
                    dot.className = 'new-job-indicator';
                    dot.title = 'Posted within the last 7 days';
                    
                    const titleText = document.createElement('span');
                    titleText.textContent = row[header] !== undefined ? row[header] : '';
                    
                    wrapper.appendChild(dot);
                    wrapper.appendChild(titleText);
                    td.appendChild(wrapper);
                } else {
                    td.textContent = row[header] !== undefined ? row[header] : '';
                }
            }
            // Special handling for links
            else if (header === 'link' && row[header] && row[header].startsWith('http')) {
                const a = document.createElement('a');
                a.href = row[header];
                const url = row[header];
                
                // Initialize view count if not exists
                if (!viewCounts[url]) {
                    viewCounts[url] = 0;
                }
                
                // Show view text with count if viewed before
                const count = viewCounts[url];
                console.log(`Link: ${url}, Count: ${count}`);
                a.textContent = count > 0 ? `View (${count})` : 'View';
                
                a.target = '_blank';
                a.addEventListener('click', (e) => {
                    e.preventDefault();
                    // Increment view count
                    viewCounts[url]++;
                    console.log(`Clicked: ${url}, New count: ${viewCounts[url]}`);
                    // Update button text
                    a.textContent = `View (${viewCounts[url]})`;
                    // Save to localStorage
                    saveViewCounts();
                    // Open the link
                    window.electronAPI.openExternal(url);
                });
                td.appendChild(a);
            } else {
                // For non-link cells, display the value
                td.textContent = row[header] !== undefined ? row[header] : '';
            }
            
            tr.appendChild(td);
        });
        
        tableBody.appendChild(tr);
    });
    
    // Update the pagination controls
    if (document.querySelector('.modern-pagination')) {
        updateModernPagination();
    } else {
        updatePaginationControls();
    }
}

function showStatus(message, type) {
    const statusBar = document.getElementById('statusBar');
    statusBar.textContent = message;
    statusBar.className = `status-bar ${type}`;
} 