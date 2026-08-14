import { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = '';

export const useDashboardData = (timeFilter = 'All', sourceFilter = 'All', productFilter = 'All') => {
  const [stats, setStats] = useState({ totalComplaints: 0, complaintRate: "0%", avgResolutionTime: "0 hrs" });
  const [categories, setCategories] = useState([]);
  const [sentiments, setSentiments] = useState([]);
  const [risks, setRisks] = useState([]);
  const [trend, setTrend] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (timeFilter !== 'All') params.append('time', timeFilter);
        if (sourceFilter !== 'All') params.append('source', sourceFilter);
        if (productFilter !== 'All') params.append('product', productFilter);
        const q = params.toString() ? `?${params.toString()}` : '';

        const [statsRes, catRes, sentRes, risksRes, trendRes] = await Promise.all([
          axios.get(`${API_URL}/stats${q}`),
          axios.get(`${API_URL}/categories${q}`),
          axios.get(`${API_URL}/sentiment${q}`),
          axios.get(`${API_URL}/risks${q}`),
          axios.get(`${API_URL}/trend${q}`)
        ]);

        setStats(statsRes.data);
        setCategories(catRes.data);
        setSentiments(sentRes.data);
        setRisks(risksRes.data);
        setTrend(trendRes.data);
        setError(null);
      } catch (err) {
        console.error("Error fetching data:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [timeFilter, sourceFilter, productFilter]);

  return { stats, categories, sentiments, risks, trend, loading, error };
};
