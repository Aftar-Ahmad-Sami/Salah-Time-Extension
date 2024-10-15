// Event listener for when the DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  if (navigator.geolocation) {
    // Get the current position
    navigator.geolocation.getCurrentPosition(function(position) {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      const date = new Date();
      
      // Fetch location name using reverse geocoding
      fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`)
        .then(response => response.json())
        .then(data => {
          const locationName = data.display_name;
          document.getElementById('location').innerHTML = `<p>${locationName}</p>`;
        })
        .catch(error => {
          console.error('Error fetching location:', error);
          document.getElementById('location').innerHTML = '<p>Unable to fetch location</p>';
        });

      // Fetch prayer times
      fetch(`https://api.aladhan.com/v1/timings/${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}?latitude=${lat}&longitude=${lon}&method=2&school=1&midnightMode=1&timezonestring=auto`)
        .then(response => response.json())
        .then(data => {
          const timings = data.data.timings;
          const prayerOrder = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
          const prayerTimesDiv = document.getElementById('prayerTimes');
          let prayerTimesHTML = '';

          // Generate HTML for each prayer time
          prayerOrder.forEach((prayer) => {
            const startTime = convertTo12Hour(timings[prayer]);

            prayerTimesHTML += `
              <div class="prayer-card" id="${prayer.toLowerCase()}-card">
                <div class="prayer-name">${prayer}</div>
                <div class="prayer-time">
                  <span><b>Starts:&nbsp;</b>${startTime}</span>
                </div>
              </div>
            `;
          });

          // Set the generated HTML for prayer times
          prayerTimesDiv.innerHTML = prayerTimesHTML;

          // Highlight the current prayer time
          highlightCurrentPrayer(timings);
        })
        .catch(error => {
          console.error('Error fetching prayer times:', error);
          document.getElementById('prayerTimes').innerHTML = '<p>Unable to fetch prayer times</p>';
        });
    }, function(error) {
      console.error('Error getting location:', error);
      document.getElementById('location').innerHTML = '<p>Unable to get location</p>';
    });
  } else {
    console.log("Geolocation is not supported by this browser.");
    document.getElementById('location').innerHTML = '<p>Geolocation not supported</p>';
  }
});

/**
 * Converts a 24-hour time format to a 12-hour time format.
 * @param {string} time24 - The time in 24-hour format (e.g., "14:30").
 * @returns {string} The time in 12-hour format (e.g., "2:30 PM").
 */
function convertTo12Hour(time24) {
  const [hours, minutes] = time24.split(':');
  let period = 'AM';
  let hours12 = parseInt(hours, 10);
  
  if (hours12 >= 12) {
    period = 'PM';
    if (hours12 > 12) {
      hours12 -= 12;
    }
  }
  if (hours12 === 0) {
    hours12 = 12;
  }
  
  return `${hours12}:${minutes} ${period}`;
}

/**
 * Highlights the current prayer based on the given timings.
 * @param {Object} timings - The prayer timings.
 */
function highlightCurrentPrayer(timings) {
  const now = new Date();
  const currentTime = now.getHours() * 60 + now.getMinutes();

  const prayerOrder = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  let currentPrayer = prayerOrder[prayerOrder.length - 1];

  // Find the current prayer based on the current time
  for (let i = 0; i < prayerOrder.length; i++) {
    const prayerTime = timings[prayerOrder[i]].split(':');
    const prayerMinutes = parseInt(prayerTime[0]) * 60 + parseInt(prayerTime[1]);

    if (currentTime < prayerMinutes) {
      currentPrayer = i > 0 ? prayerOrder[i - 1] : prayerOrder[prayerOrder.length - 1];
      break;
    }
  }

  // Highlight the current prayer element
  const currentPrayerElement = document.getElementById(`${currentPrayer.toLowerCase()}-card`);
  if (currentPrayerElement) {
    currentPrayerElement.classList.add('current-prayer');
  }
}
