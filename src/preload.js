const { contextBridge, ipcRenderer } = require('electron');

// Set up the IPC listeners before exposing the API
ipcRenderer.on('update-status', (_, statusData) => {
  window.dispatchEvent(new CustomEvent('update-status', { 
    detail: statusData 
  }));
});

contextBridge.exposeInMainWorld('electronAPI', {
  startScrape: (options) => ipcRenderer.invoke('start-scrape', options),
  getFiles: () => ipcRenderer.invoke('get-files'),
  deleteFile: (filename) => ipcRenderer.send('delete-file', filename),
  openFile: (filename) => ipcRenderer.send('open-file', filename),
  downloadFile: (filename) => ipcRenderer.invoke('download-file', filename),
  readCsvFile: (filename) => ipcRenderer.invoke('read-csv-file', filename),
  openExternal: (url) => ipcRenderer.send('open-external', url)
}); 