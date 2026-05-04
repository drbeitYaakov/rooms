"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { authenticatedFetch } from "../../lib/auth-backend-bridge";

interface Grade {
  id: string;
  name: string;
  coordinator_id?: string;
  coordinator_name?: string;
  coordinator_email?: string;
  created_at: string;
  updated_at: string;
}

interface User {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

export default function GradesPage() {
  const { data: session } = useSession();
  const [grades, setGrades] = useState<Grade[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingGrade, setEditingGrade] = useState<Grade | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    coordinator_id: ''
  });

  const isAdmin = session?.user?.role === 'admin';
  const isCoordinator = session?.user?.role === 'grade_coordinator';

  useEffect(() => {
    fetchGrades();
    fetchUsers();
  }, []);

  const fetchGrades = async () => {
    try {
      const response = await authenticatedFetch('http://localhost:3001/api/grades');
      const data = await response.json();
      
      if (Array.isArray(data)) {
        setGrades(data);
      } else if (data.success) {
        setGrades(data.data || data.data.grades || []);
      } else {
        console.error('Failed to fetch grades:', data.error);
      }
    } catch (error) {
      console.error('Error fetching grades:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await authenticatedFetch('http://localhost:3001/api/users');
      const data = await response.json();
      
      if (data.success) {
        setUsers(data.data.users || []);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name) {
      alert('נא להזין שם שכבה');
      return;
    }

    try {
      const url = editingGrade 
        ? `http://localhost:3001/api/grades/${editingGrade.id}`
        : 'http://localhost:3001/api/grades';
      
      const method = editingGrade ? 'PUT' : 'POST';
      
      const response = await authenticatedFetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          coordinator_id: formData.coordinator_id || null,
          level: formData.name
        }),
      });

      if (response.ok) {
        alert(editingGrade ? 'שכבה עודכנה בהצלחה!' : 'שכבה נוספה בהצלחה!');
        setShowAddModal(false);
        setEditingGrade(null);
        setFormData({ name: '', coordinator_id: '' });
        fetchGrades();
      } else {
        const error = await response.json();
        alert(`שגיאה: ${error.error || 'אירעה שגיאה'}`);
      }
    } catch (error) {
      console.error('Error saving grade:', error);
      alert('אירעה שגיאה בשמירת השכבה');
    }
  };

  const handleEdit = (grade: Grade) => {
    setEditingGrade(grade);
    setFormData({
      name: grade.name,
      coordinator_id: grade.coordinator_id || ''
    });
    setShowAddModal(true);
  };

  const handleDelete = async (gradeId: string) => {
    if (!confirm('האם אתה בטוח שברצונך למחוק שכבה זו?')) {
      return;
    }

    try {
      const response = await authenticatedFetch(`http://localhost:3001/api/grades/${gradeId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        alert('שכבה נמחקה בהצלחה!');
        fetchGrades();
      } else {
        const error = await response.json();
        alert(`שגיאה: ${error.error || 'אירעה שגיאה'}`);
      }
    } catch (error) {
      console.error('Error deleting grade:', error);
      alert('אירעה שגיאה במחיקת השכבה');
    }
  };

  const getGradeColor = (gradeName: string) => {
    const colors: Record<string, string> = {
      'א': 'bg-red-100 text-red-800',
      'ב': 'bg-orange-100 text-orange-800',
      'ג': 'bg-yellow-100 text-yellow-800',
      'ד': 'bg-green-100 text-green-800',
      'ה': 'bg-blue-100 text-blue-800',
      'ו': 'bg-purple-100 text-purple-800'
    };
    return colors[gradeName] || 'bg-gray-100 text-gray-800';
  };

  const getCoordinatorName = (coordinatorId: string) => {
    const user = users.find(u => u.id === coordinatorId);
    return user ? user.full_name : 'לא הוקצה רכז';
  };

  if (!isAdmin && !isCoordinator) {
    return (
      <div className="min-h-screen bg-gray-50" dir="rtl">
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="bg-white shadow rounded-lg p-6 text-center">
            <div className="text-red-600">אין לך הרשאות לגשת לעמוד זה</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-lg text-gray-600">טוען...</div>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900">ניהול שכבות</h1>
              <p className="text-gray-600">צפייה וניהול שכבות לימוד ורכזי שכבה</p>
            </div>

            {/* Actions */}
            {isAdmin && (
              <div className="bg-white shadow rounded-lg mb-6">
                <div className="px-4 py-5 sm:p-6">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">
                      פעולות ניהול
                    </h3>
                    <button 
                      onClick={() => {
                        setEditingGrade(null);
                        setFormData({ name: '', coordinator_id: '' });
                        setShowAddModal(true);
                      }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                    >
                      הוסף שכבה חדשה
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Grades Table */}
            <div className="bg-white shadow rounded-lg overflow-hidden">
              <div className="px-4 py-5 sm:p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">רשימת שכבות</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        שכבה
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        רכז שכבה
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        תאריך יצירה
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        פעולות
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {grades.map((grade) => (
                      <tr key={grade.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getGradeColor(grade.name)}`}>
                            שכבת {grade.name}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {getCoordinatorName(grade.coordinator_id || '')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(grade.created_at).toLocaleDateString('he-IL')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          {isAdmin && (
                            <>
                              <button 
                                onClick={() => handleEdit(grade)}
                                className="text-indigo-600 hover:text-indigo-900 ml-3"
                              >
                                ערוך
                              </button>
                              <button 
                                onClick={() => handleDelete(grade.id)}
                                className="text-red-600 hover:text-red-900"
                              >
                                מחק
                              </button>
                            </>
                          )}
                          {!isAdmin && (
                            <span className="text-gray-400">אין הרשאות</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Add/Edit Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
              <div className="mt-3">
                <h3 className="text-lg leading-6 font-medium text-gray-900 text-center">
                  {editingGrade ? 'עריכת שכבה' : 'הוספת שכבה חדשה'}
                </h3>
                <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      שם שכבה
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="א, ב, ג, ד, ה, ו"
                      maxLength={1}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      רכז שכבה
                    </label>
                    <select
                      value={formData.coordinator_id}
                      onChange={(e) => setFormData({ ...formData, coordinator_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">בחר רכז</option>
                      {users.filter(u => u.role === 'grade_coordinator').map(user => (
                        <option key={user.id} value={user.id}>
                          {user.full_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex justify-end space-x-3 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddModal(false);
                        setEditingGrade(null);
                        setFormData({ name: '', coordinator_id: '' });
                      }}
                      className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                    >
                      ביטול
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                    >
                      {editingGrade ? 'עדכן' : 'הוסף'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
