const API_BASE_URL = '/api';

export async function fetchBuildings(params = {}) {
  const queryString = new URLSearchParams(params).toString();
  const url = `${API_BASE_URL}/buildings${queryString ? `?${queryString}` : ''}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching buildings:', error);
    throw error;
  }
}

export async function fetchBuildingById(id) {
  const url = `${API_BASE_URL}/buildings/${id}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching building:', error);
    throw error;
  }
}

export async function fetchPipes(params = {}) {
  const queryString = new URLSearchParams(params).toString();
  const url = `${API_BASE_URL}/pipes${queryString ? `?${queryString}` : ''}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching pipes:', error);
    throw error;
  }
}

export async function fetchPipeById(id) {
  const url = `${API_BASE_URL}/pipes/${id}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching pipe:', error);
    throw error;
  }
}

export async function checkHealth() {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Health check failed:', error);
    throw error;
  }
}
