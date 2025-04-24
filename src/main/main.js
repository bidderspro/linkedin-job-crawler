const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { scrapeLinkedInJobs } = require('./scraper');
const fs = require('fs');
const { parse } = require('csv-parse/sync');
const { formatBytes, OUTPUT_DIR, ensureOutputDir } = require('./utils');

// Ensure output directory exists
ensureOutputDir();

let mainWindow;
let splashWindow;

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 500, 
    height: 400,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload.js')
    }
  });

  splashWindow.loadFile(path.join(__dirname, '../renderer/views/splash.html'));
  splashWindow.center();
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/views/main.html'));
  
  mainWindow.once('ready-to-show', () => {
    setTimeout(() => {
      if (splashWindow) {
        splashWindow.close();
        splashWindow = null;
      }
      mainWindow.show();
      mainWindow.center();
    }, 500);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createSplashWindow();
  
  setTimeout(() => {
    createMainWindow();
  }, 3000);
});

ipcMain.on('splash-finished', () => {
  if (mainWindow) {
    mainWindow.show();
  }
  
  if (splashWindow) {
    splashWindow.close();
    splashWindow = null;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

// Add this helper function near the top of the file after imports
function checkInternetConnection() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Connection timeout'));
    }, 10000);
    
    require('dns').lookup('www.linkedin.com', (err) => {
      clearTimeout(timeout);
      if (err && err.code === "ENOTFOUND") {
        reject(new Error('No internet connection'));
      } else if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// IPC Handlers
ipcMain.handle('start-scrape', async (_, { keyword, location, jobCount, timeRange }) => {
  try {
    mainWindow.webContents.send('update-status', { 
      message: 'Checking internet connection...', 
      type: 'processing' 
    });
    
    // Check internet connectivity first with retries
    let connectionAttempts = 0;
    const maxConnectionRetries = 3;
    let isConnected = false;
    
    while (!isConnected && connectionAttempts < maxConnectionRetries) {
      try {
        connectionAttempts++;
        await checkInternetConnection();
        isConnected = true;
      } catch (connectionError) {
        mainWindow.webContents.send('update-status', { 
          message: `Internet connection check failed (attempt ${connectionAttempts}/${maxConnectionRetries}). Retrying...`, 
          type: 'warning' 
        });
        
        if (connectionAttempts >= maxConnectionRetries) {
          mainWindow.webContents.send('update-status', { 
            message: `Error: No internet connection. Please connect to the internet and try again.`, 
            type: 'error' 
          });
          return { error: 'Internet connection error: Please check your network connection and try again.' };
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    mainWindow.webContents.send('update-status', { 
      message: 'Starting scraper...', 
      type: 'processing' 
    });
    
    const result = await scrapeLinkedInJobs({ 
      keyword, 
      location, 
      jobCount: parseInt(jobCount) || 10,
      timeRange: timeRange || 'all'
    });
    
    if (result.error) {
      mainWindow.webContents.send('update-status', { 
        message: `Error: ${result.error}`, 
        type: 'error' 
      });
      return { error: result.error };
    }
    
    mainWindow.webContents.send('update-status', { 
      message: `Successfully scraped ${result.jobs.length} jobs!`, 
      type: 'success' 
    });
    
    return result;
  } catch (error) {
    // Enhanced network error detection
    if (error.message.includes('net::ERR_INTERNET_DISCONNECTED') || 
        error.message.includes('net::ERR_PROXY_CONNECTION_FAILED') ||
        error.message.includes('net::ERR_NAME_NOT_RESOLVED') ||
        error.message.includes('net::ERR_CONNECTION_RESET') ||
        error.message.includes('net::ERR_NETWORK_CHANGED') ||
        error.message.includes('net::ERR_CONNECTION_REFUSED')) {
      const errorMsg = 'Network error: Please check your internet connection and try again.';
      mainWindow.webContents.send('update-status', { 
        message: `Error: ${errorMsg}`, 
        type: 'error' 
      });
      return { error: errorMsg };
    }
    
    mainWindow.webContents.send('update-status', { 
      message: `Error: ${error.message}`, 
      type: 'error' 
    });
    return { error: error.message };
  }
});

ipcMain.handle('get-files', () => {
  ensureOutputDir();
  
  try {
    return fs.readdirSync(OUTPUT_DIR)
      .filter(file => file.endsWith('.csv'))
      .map(file => {
        const stats = fs.statSync(path.join(OUTPUT_DIR, file));
        return {
          name: file,
          size: formatBytes(stats.size),
          date: stats.mtime.toLocaleString()
        };
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  } catch (error) {
    console.error('Error reading files:', error);
    return [];
  }
});

ipcMain.on('delete-file', (_, filename) => {
  const filePath = path.join(OUTPUT_DIR, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
});

ipcMain.on('open-file', (_, filename) => {
  const filePath = path.join(OUTPUT_DIR, filename);
  if (fs.existsSync(filePath)) {
    shell.openPath(filePath);
  } else {
    dialog.showErrorBox('File Not Found', `The file ${filename} could not be found.`);
  }
});

ipcMain.handle('download-file', async (_, filename) => {
  try {
    const filePath = path.join(OUTPUT_DIR, filename);
    
    if (!fs.existsSync(filePath)) {
      return { error: 'File not found' };
    }
    
    const saveDialog = await dialog.showSaveDialog({
      title: 'Save CSV File',
      defaultPath: path.join(app.getPath('downloads'), filename),
      filters: [
        { name: 'CSV Files', extensions: ['csv'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    
    if (saveDialog.canceled) {
      return { canceled: true };
    }
    
    fs.copyFileSync(filePath, saveDialog.filePath);
    
    return { success: true, savedPath: saveDialog.filePath };
  } catch (error) {
    console.error('Error downloading file:', error);
    return { error: error.message };
  }
});

// New IPC handlers for view functionality
ipcMain.handle('read-csv-file', (_, filename) => {
  try {
    const filePath = path.join(OUTPUT_DIR, filename);
    
    if (!fs.existsSync(filePath)) {
      return { error: 'File not found' };
    }
    
    const content = fs.readFileSync(filePath, 'utf8');
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true
    });
    
    return { data: records };
  } catch (error) {
    console.error('Error reading CSV file:', error);
    return { error: error.message };
  }
});

ipcMain.on('open-external', (_, url) => {
  shell.openExternal(url);
});