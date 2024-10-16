const fetching = async (lat, lon) => {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`);
        const data = await response.json();
        console.log(data.display_name);
    } catch (error) {
        console.error(error);
    }
};

const lat = '';
const lon = '';
fetching(lat, lon);
