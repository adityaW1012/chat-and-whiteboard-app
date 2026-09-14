import axios from 'axios';

const api = axios.create({
  baseURL: '/api', // relative path, works no matter what domain we're on
});
// Automatically attach the JWT token to every request, if we have one
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;