# LinkedIn Job Scraper (Electron App)

A desktop application built with Electron.js that allows you to scrape LinkedIn job listings and save them as CSV files.

## Features

- Search LinkedIn jobs by keyword and location
- Specify the number of job listings to scrape
- Save results as CSV files
- View, open, and manage scraped job data
- Clean and intuitive user interface

## Installation

### Prerequisites

- Node.js 16 or higher
- npm or yarn package manager

### Setup

1. Clone this repository
```
git clone https://github.com/yourusername/linkedin-scraper-electron.git
cd linkedin-scraper-electron
```

2. Install dependencies
```
npm install
```

3. Create a `.env` file in the root directory (optional)
```
API_KEY=your_api_key_if_needed
```

4. Start the application
```
npm start
```

## Building the Application

To build the application for your platform:

```
npm run build
```

This will create distributable packages in the `dist` folder.

## Usage

1. Enter a job title keyword in the first input field
2. Enter a location in the second input field
3. Specify how many job listings you want to scrape
4. Click "Search Jobs" to start the scraping process
5. Once complete, the results will be saved as a CSV file
6. You can view, open, or delete saved files from the main screen

## Technical Details

This application uses:

- Electron.js for the desktop application framework
- Puppeteer for web scraping
- CSV-Writer for generating CSV files
- Custom UI built with vanilla HTML, CSS, and JavaScript

## Author

- [Muhammad Umar Malik](https://github.com/MuhammadUmarMalik)

## License

MIT

## Disclaimer

This tool is for educational purposes only. Scraping LinkedIn data may violate LinkedIn's Terms of Service. Use this application responsibly and ethically. The developers are not responsible for any misuse or consequences arising from the use of this tool. 