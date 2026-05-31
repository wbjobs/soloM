import axios from 'axios';

const API_BASE = '/api';

export const fetchSankeyData = async (file, startDate, endDate) => {
  try {
    const params = {};
    if (file) params.file = file;
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    
    const response = await axios.get(`${API_BASE}/sankey-data`, { params });
    return response.data;
  } catch (error) {
    console.error('Error fetching sankey data:', error);
    throw error;
  }
};

export const fetchNodeDetails = async (nodeName) => {
  try {
    const response = await axios.get(`${API_BASE}/node-details`, {
      params: { name: nodeName }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching node details:', error);
    throw error;
  }
};

export const fetchAvailableFiles = async () => {
  try {
    const response = await axios.get(`${API_BASE}/available-files`);
    return response.data.files;
  } catch (error) {
    console.error('Error fetching available files:', error);
    throw error;
  }
};
