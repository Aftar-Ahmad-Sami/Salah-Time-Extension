# Salah Times Extension

![Extension Icon](https://raw.githubusercontent.com/Aftar-Ahmad-Sami/Salah-Time-Extension/refs/heads/main/icons/icons8-mosque-flat-96.png)

## Overview

The **Salah Times Extension** is a simple yet powerful tool that provides accurate prayer times based on your current location. With just one click, you can view the start and end times of each prayer along with your full location details.

## Features

- Displays start and end times for Fajr, Dhuhr, Asr, Maghrib, and Isha prayers.
- Automatically detects your location to provide precise timings.
- Highlights the current prayer time.
- Shows full location information using OpenStreetMap's Nominatim API.

## Installation

1. Clone or download this repository to your local machine.
2. Open Chrome (or another Chromium-based browser) and navigate to `chrome://extensions/`.
3. Enable "Developer mode" in the top right corner.
4. Click "Load unpacked" and select the directory where you downloaded/cloned this repository.

## Usage

1. Once installed, you'll see an icon in your browser toolbar.
2. Click on the icon to open the popup displaying prayer times and location information.

## Technologies Used

- **JavaScript**: For fetching data from APIs and updating UI elements dynamically.
- **HTML/CSS**: To create a clean user interface within the extension popup.
- **AlAdhan API**: Provides accurate Islamic prayer timings based on geographical coordinates.
- **OpenStreetMap Nominatim API**: Retrieves detailed address information from latitude/longitude coordinates.

## Contributing

Contributions are welcome! If you'd like to contribute code or suggest improvements:
1. Fork this repository
2. Create a new branch (`git checkout -b feature/YourFeature`)
3. Commit your changes (`git commit -m 'Add some feature'`)
4. Push to the branch (`git push origin feature/YourFeature`)
5. Open a pull request

Please ensure all contributions adhere to existing coding styles and include appropriate documentation/comments where necessary.

## License

This project is licensed under [MIT License](LICENSE).
