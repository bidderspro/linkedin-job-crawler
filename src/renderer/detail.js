// Get the filename from the URL
const urlParams = new URLSearchParams(window.location.search);
const filename = urlParams.get('file');
let allData = [];
let currentPage = 1;
let pageSize = 10;
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
        
        // Create a fullscreen toggle button
        const fullscreenButton = document.createElement('button');
        fullscreenButton.textContent = 'Expand Table';
        fullscreenButton.className = 'expand-button';
        fullscreenButton.addEventListener('click', toggleFullscreenTable);
        
        // Add it to the file-actions div
        const fileActions = document.querySelector('.file-actions');
        fileActions.appendChild(fullscreenButton);
        
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

// Toggle fullscreen table view
function toggleFullscreenTable() {
    const container = document.querySelector('.container');
    const button = document.querySelector('.expand-button');
    
    if (container.classList.contains('fullscreen-mode')) {
        // Exit fullscreen
        container.classList.remove('fullscreen-mode');
        button.textContent = 'Expand Table';
        document.body.style.overflow = 'auto';
    } else {
        // Enter fullscreen
        container.classList.add('fullscreen-mode');
        button.textContent = 'Shrink Table';
        document.body.style.overflow = 'hidden';
    }
}

// Save view counts to localStorage
function saveViewCounts() {
    localStorage.setItem(`viewCounts_${filename}`, JSON.stringify(viewCounts));
    console.log('Saved view counts:', viewCounts);
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
        
        uniqueHeaders.forEach(header => {
            const td = document.createElement('td');
            
            // Special handling for links
            if (header === 'link' && row[header] && row[header].startsWith('http')) {
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
            } 
            // Special handling for posted date
            else if (header === 'postedDate') {
                const date = row[header] || 'Not available';
                // Handle different date formats and make them more readable
                if (date !== 'Not available') {
                    try {
                        const dateObj = new Date(date);
                        if (!isNaN(dateObj.getTime())) {
                            // Format the date in a more readable way (ex: "May 27, 2024")
                            const options = { year: 'numeric', month: 'short', day: 'numeric' };
                            const formattedDate = dateObj.toLocaleDateString('en-US', options);
                            td.textContent = formattedDate;

                            // Add a class for styling if the date is recent (within 7 days)
                            const now = new Date();
                            const daysDiff = Math.floor((now - dateObj) / (1000 * 60 * 60 * 24));
                            if (daysDiff <= 7) {
                                td.classList.add('recent-post');
                            }
                        } else {
                            td.textContent = date; // Use the original date string if parsing fails
                        }
                    } catch (dateError) {
                        console.log(`Error formatting date ${date}:`, dateError);
                        td.textContent = date; // Fallback to the original string
                    }
                } else {
                    td.textContent = 'Not available';
                }
            }
            // Special handling for application count
            else if (header === 'applicationsCount') {
                const count = row[header] || 'Not available';
                td.textContent = count;
                
                // Add classes for styling based on application count
                if (count !== 'Not available') {
                    if (count === 'Under 5') {
                        td.classList.add('very-low-applications');
                        td.title = 'Very few applicants - great opportunity!';
                    } else if (isNaN(count)) {
                        // For any other text-based counts
                        td.textContent = count;
                    } else {
                        // For numeric counts
                        const appCount = parseInt(count);
                        if (appCount < 10) {
                            td.classList.add('low-applications');
                            td.title = 'Low competition';
                        } else if (appCount > 50) {
                            td.classList.add('high-applications');
                            td.title = 'High competition';
                        } else {
                            td.title = 'Moderate competition';
                        }
                    }
                }
            }
            else {
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