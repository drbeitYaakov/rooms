"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { authenticatedFetch } from "../../lib/auth-backend-bridge";

interface UtilizationData {
  summary: {
    totalRooms: number;
    activeRooms: number;
    utilizationRate: number;
  };
  rooms: Array<{
    id: number;
    name: string;
    type: string;
    capacity: number;
    utilization: number;
  }>;
}

interface ConflictsData {
  totalConflicts: number;
  conflicts: Array<{
    id: string;
    room: string;
    date: string;
    timeRange: string;
    assignments: Array<{ id: string; type: string }>;
  }>;
}

interface StatisticsData {
  summary: {
    totalAssignments: number;
    totalStudyGroups: number;
    totalRegularClasses: number;
    totalMeetings: number;
  };
  byType: Array<{
    type: string;
    count: number;
    daysActive: number;
  }>;
  daily: Array<{
    date: string;
    assignments: number;
    roomsUsed: number;
  }>;
}

export default function ReportsPage() {
  const { data: session } = useSession();
  const [utilizationData, setUtilizationData] = useState<UtilizationData | null>(null);
  const [conflictsData, setConflictsData] = useState<ConflictsData | null>(null);
  const [statisticsData, setStatisticsData] = useState<StatisticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState('week');

  useEffect(() => {
    fetchReportsData();
  }, [selectedPeriod]);

  const fetchReportsData = async () => {
    try {
      setLoading(true);
      const { startDate, endDate } = getDateRange(selectedPeriod);
      
      const [utilizationRes, conflictsRes, statisticsRes] = await Promise.all([
        authenticatedFetch(`https://rooms-ma9h.onrender.com/api/reports/utilization?startDate=${startDate}&endDate=${endDate}`),
        authenticatedFetch(`https://rooms-ma9h.onrender.com/api/reports/conflicts?startDate=${startDate}&endDate=${endDate}`),
        authenticatedFetch(`https://rooms-ma9h.onrender.com/api/reports/statistics?startDate=${startDate}&endDate=${endDate}`)
      ]);

      const utilization = await utilizationRes.json();
      const conflicts = await conflictsRes.json();
      const statistics = await statisticsRes.json();

      if (utilization.success) setUtilizationData(utilization.data);
      if (conflicts.success) setConflictsData(conflicts.data);
      if (statistics.success) setStatisticsData(statistics.data);
    } catch (error) {
      console.error('Error fetching reports data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDateRange = (period: string) => {
    const endDate = new Date();
    const startDate = new Date();
    
    switch (period) {
      case 'week':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(endDate.getMonth() - 1);
        break;
      case 'quarter':
        startDate.setMonth(endDate.getMonth() - 3);
        break;
      case 'year':
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
      default:
        startDate.setDate(endDate.getDate() - 7);
    }
    
    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
    };
  };

  const handleExportReport = async (type: string, format: 'json' | 'csv' = 'json') => {
    try {
      const { startDate, endDate } = getDateRange(selectedPeriod);
      const response = await authenticatedFetch(
        `https://rooms-ma9h.onrender.com/api/reports/export?type=${type}&format=${format}&startDate=${startDate}&endDate=${endDate}`
      );
      const data = await response.json();
      
      if (data.success) {
        let content: string;
        let mimeType: string;
        let fileName: string;
        
        if (format === 'csv') {
          content = convertToCSV(data.data);
          mimeType = 'text/csv;charset=utf-8;';
          fileName = `report_${type}_${new Date().toISOString().split('T')[0]}.csv`;
        } else {
          content = JSON.stringify(data, null, 2);
          mimeType = 'application/json';
          fileName = `report_${type}_${new Date().toISOString().split('T')[0]}.json`;
        }
        
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Error exporting report:', error);
      alert('׳©׳’׳™׳׳” ׳‘׳™׳™׳¦׳•׳ ׳”׳“׳•׳—');
    }
  };

  const convertToCSV = (data: any): string => {
    if (!data) return '';
    
    // Simple CSV conversion for different report types
    if (data.summary && data.byType) {
      // Statistics report
      let csv = '׳¡׳•׳’,׳›׳׳•׳×,׳™׳׳™׳ ׳₪׳¢׳™׳׳™׳\n';
      data.byType.forEach((item: any) => {
        csv += `"${item.type}",${item.count},${item.daysActive}\n`;
      });
      return csv;
    } else if (data.summary && data.rooms) {
      // Utilization report
      let csv = '׳©׳ ׳—׳“׳¨,׳¡׳•׳’,׳×׳›׳•׳׳”,׳ ׳™׳¦׳•׳׳× (%)\n';
      data.rooms.forEach((room: any) => {
        csv += `"${room.name}","${room.type}",${room.capacity},${room.utilization}\n`;
      });
      return csv;
    } else if (data.conflicts) {
      // Conflicts report
      let csv = '׳—׳“׳¨,׳×׳׳¨׳™׳,׳˜׳•׳•׳— ׳–׳׳,׳¡׳•׳’ 1,׳¡׳•׳’ 2\n';
      data.conflicts.forEach((conflict: any) => {
        csv += `"${conflict.room}","${conflict.date}","${conflict.timeRange}","${conflict.assignments[0].type}","${conflict.assignments[1].type}"\n`;
      });
      return csv;
    }
    
    return JSON.stringify(data);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-lg text-gray-600">׳˜׳•׳¢׳ ׳“׳•׳—׳•׳×...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">׳“׳•׳—׳•׳× ׳•׳׳ ׳׳™׳˜׳™׳§׳”</h1>
            <select 
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="week">׳©׳‘׳•׳¢ ׳׳—׳¨׳•׳</option>
              <option value="month">׳—׳•׳“׳© ׳׳—׳¨׳•׳</option>
              <option value="quarter">׳¨׳‘׳¢׳•׳ ׳׳—׳¨׳•׳</option>
              <option value="year">׳©׳ ׳” ׳׳—׳¨׳•׳ ׳”</option>
            </select>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">נ“ ׳“׳•׳— ׳ ׳™׳¦׳•׳׳× ׳—׳“׳¨׳™׳</h2>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">׳ ׳™׳¦׳•׳׳× ׳׳׳•׳¦׳¢׳×</span>
                  <span className="text-lg font-semibold text-green-600">
                    {utilizationData?.summary.utilizationRate || 0}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-green-600 h-2 rounded-full transition-all duration-300" 
                    style={{width: `${utilizationData?.summary.utilizationRate || 0}%`}}
                  ></div>
                </div>
                <div className="text-sm text-gray-600">
                  <div>׳—׳“׳¨׳™׳ ׳₪׳¢׳™׳׳™׳: {utilizationData?.summary.activeRooms || 0} / {utilizationData?.summary.totalRooms || 0}</div>
                </div>
                <button 
                  onClick={() => handleExportReport('utilization')}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                >
                  ׳¦׳•׳¨ ׳“׳•׳— ׳׳₪׳•׳¨׳˜
                </button>
              </div>
            </div>

            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">ג ן¸ ׳“׳•׳— ׳§׳•׳ ׳₪׳׳™׳§׳˜׳™׳</h2>
              <div className="space-y-4">
                <div className="text-center text-gray-500">
                  <div className="text-4xl mb-2">{conflictsData?.totalConflicts || 0}</div>
                  <p className="text-sm">׳§׳•׳ ׳₪׳׳™׳§׳˜׳™׳ ׳₪׳¢׳™׳׳™׳ ׳”׳™׳•׳</p>
                </div>
                {(conflictsData?.totalConflicts || 0) > 0 && (
                  <div className="text-sm text-red-600">
                    {conflictsData?.conflicts.slice(0, 3).map((conflict, index) => (
                      <div key={conflict.id} className="mb-1">
                        {conflict.room} - {conflict.date}
                      </div>
                    ))}
                  </div>
                )}
                <button 
                  onClick={() => handleExportReport('conflicts')}
                  className="w-full bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                >
                  ׳¦׳₪׳” ׳‘׳§׳•׳ ׳₪׳׳™׳§׳˜׳™׳
                </button>
              </div>
            </div>

            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">נ“ˆ ׳¡׳˜׳˜׳™׳¡׳˜׳™׳§׳•׳× ׳©׳™׳‘׳•׳¥</h2>
              <div className="space-y-3 mb-4">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">׳¡׳”"׳› ׳©׳™׳‘׳•׳¦׳™׳</span>
                  <span className="font-medium">{statisticsData?.summary.totalAssignments || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">׳”׳§׳‘׳¦׳•׳×</span>
                  <span className="font-medium">{statisticsData?.summary.totalStudyGroups || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">׳©׳™׳¢׳•׳¨׳™׳ ׳¨׳’׳™׳׳™׳</span>
                  <span className="font-medium">{statisticsData?.summary.totalRegularClasses || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">׳₪׳’׳™׳©׳•׳×</span>
                  <span className="font-medium">{statisticsData?.summary.totalMeetings || 0}</span>
                </div>
              </div>
              
              {/* Simple Bar Chart */}
              <div className="mt-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">׳—׳׳•׳§׳× ׳©׳™׳‘׳•׳¦׳™׳ ׳׳₪׳™ ׳¡׳•׳’</h3>
                <div className="space-y-2">
                  {statisticsData?.byType.map((stat, index) => {
                    const total = statisticsData.summary.totalAssignments;
                    const percentage = total > 0 ? (stat.count / total) * 100 : 0;
                    const colors = ['bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500'];
                    const typeNames: Record<string, string> = {
                      'study_group': 'הקבצות',
                      'regular_class': 'שיעורים רגילים',
                      'meeting': 'מפגשים',
                      'event': 'מפגשים / אירועים',
                      'one_on_one': 'אחד על אחד',
                      'discussion_topics': 'שיח / סוגיות',
                      'high_school_pe': 'התעמלות תיכון',
                      'didactics': 'דידקטיקה',
                      'exam_makeup': 'השלמת מבחנים',
                      'other': 'אחר'
                    };
                    
                    return (
                      <div key={stat.type} className="flex items-center">
                        <span className="text-xs text-gray-600 w-20">{typeNames[stat.type] || stat.type}</span>
                        <div className="flex-1 mx-2 bg-gray-200 rounded-full h-4">
                          <div 
                            className={`${colors[index % colors.length]} h-4 rounded-full transition-all duration-300`}
                            style={{width: `${percentage}%`}}
                          ></div>
                        </div>
                        <span className="text-xs text-gray-700 w-8 text-left">{stat.count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">נ“… ׳™׳¦׳•׳ ׳“׳•׳—׳•׳×</h2>
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">׳“׳•׳— ׳¡׳˜׳˜׳™׳¡׳˜׳™׳§׳”</h3>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleExportReport('statistics', 'json')}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-md text-sm font-medium"
                    >
                      JSON
                    </button>
                    <button 
                      onClick={() => handleExportReport('statistics', 'csv')}
                      className="flex-1 bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded-md text-sm font-medium"
                    >
                      CSV
                    </button>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">׳“׳•׳— ׳ ׳™׳¦׳•׳׳×</h3>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleExportReport('utilization', 'json')}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-md text-sm font-medium"
                    >
                      JSON
                    </button>
                    <button 
                      onClick={() => handleExportReport('utilization', 'csv')}
                      className="flex-1 bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-md text-sm font-medium"
                    >
                      CSV
                    </button>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">׳“׳•׳— ׳§׳•׳ ׳₪׳׳™׳§׳˜׳™׳</h3>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleExportReport('conflicts', 'json')}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-md text-sm font-medium"
                    >
                      JSON
                    </button>
                    <button 
                      onClick={() => handleExportReport('conflicts', 'csv')}
                      className="flex-1 bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-md text-sm font-medium"
                    >
                      CSV
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Daily Trends Chart */}
            <div className="bg-white shadow rounded-lg p-6 lg:col-span-2">
              <h2 className="text-lg font-medium text-gray-900 mb-4">נ“ ׳׳’׳׳•׳× ׳™׳•׳׳™׳•׳×</h2>
              <div className="space-y-2">
                {statisticsData?.daily.slice(0, 7).reverse().map((day, index) => {
                  const maxAssignments = Math.max(...statisticsData.daily.map(d => d.assignments));
                  const percentage = maxAssignments > 0 ? (day.assignments / maxAssignments) * 100 : 0;
                  const date = new Date(day.date).toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric' });
                  
                  return (
                    <div key={day.date} className="flex items-center">
                      <span className="text-xs text-gray-600 w-24">{date}</span>
                      <div className="flex-1 mx-2 bg-gray-200 rounded-full h-3">
                        <div 
                          className="bg-gradient-to-r from-blue-400 to-blue-600 h-3 rounded-full transition-all duration-300"
                          style={{width: `${percentage}%`}}
                        ></div>
                      </div>
                      <span className="text-xs text-gray-700 w-12 text-left">{day.assignments}</span>
                      <span className="text-xs text-gray-500 w-8 text-left">{day.roomsUsed} ׳—׳“׳¨׳™׳</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
