import axios from "axios";

const http = axios.create({
  baseURL: process.env.REACT_APP_API_URL || "http://localhost:5000/api",
  headers: {
    "Content-type": "application/json"
  },
  withCredentials: true // Dit zorgt ervoor dat de browser zijn beveiligde cookies automatisch meestuurt!
});

// Onderschep antwoorden van de server om fouten (zoals 401) globaal af te handelen
http.interceptors.response.use(
  (response) => response, // Als alles goed gaat (200 OK), geef het antwoord gewoon door
  (error) => {
    if (error.response && error.response.status === 401) {
      // Token is ongeldig of verlopen
      console.warn("Sessie is verlopen. Je wordt automatisch uitgelogd.");
      
      // Verwijder alle opgeslagen gebruikersgegevens
      localStorage.clear(); // Dit wist direct token, userID, role, username en incognito
      
      // Forceer een harde redirect naar de loginpagina
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default http;
