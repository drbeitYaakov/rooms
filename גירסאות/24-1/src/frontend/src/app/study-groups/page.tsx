"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { authenticatedFetch } from "../../lib/auth-backend-bridge";

interface StudyGroup {
  id: number;
  name: string;
  group_type: 'math' | 'english' | 'didactic' | 'other';
  grade_level: 'א' | 'ב' | 'ג' | 'ד' | 'ה' | 'ו';
  student_count: number;
  needs_projector: boolean;
  is_large_group: boolean;
  consecutive_hours: number;
  preferred_room_type?: string;
  created_at: string;
}

interface Schedule {
  id: number;
  group_id: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

interface SchedulingResult {
  success: boolean;
  assignments: any[];
  conflicts: any[];
  warnings: string[];
  unscheduled_groups: StudyGroup[];
}

export default function StudyGroupsPage() {
  const { data: session } = useSession();
  const [studyGroups, setStudyGroups] = useState<StudyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSchedulingModal, setShowSchedulingModal] = useState(false);
  const [schedulingResult, setSchedulingResult] = useState<SchedulingResult | null>(null);
  const [selectedGroups, setSelectedGroups] = useState<number[]>([]);
  const [editingGroup, setEditingGroup] = useState<StudyGroup | null>(null);

  const isAdmin = session?.user?.role === 'admin';
  const isGroupCoordinator = session?.user?.role === 'group_coordinator';

  useEffect(() => {
    fetchStudyGroups();
  }, []);

  const fetchStudyGroups = async () => {
    try {
      const response = await authenticatedFetch('http://localhost:3001/api/study-groups');
      const data = await response.json();
      
      if (data.success) {
        setStudyGroups(data.data.study_groups);
      } else {
        console.error('Failed to fetch study groups:', data.error);
      }
    } catch (error) {
      console.error('Error fetching study groups:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddGroup = async (formData: any) => {
    try {
      const response = await authenticatedFetch('http://localhost:3001/api/study-groups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      
      if (data.success) {
        alert('הקבוצה נוספה בהצלחה!');
        setShowAddModal(false);
        fetchStudyGroups();
      } else {
        alert(`שגיאה: ${data.error}`);
      }
    } catch (error) {
      console.error('Error adding study group:', error);
      alert('אירעה שגיאה בהוספת הקבוצה');
    }
  };

  const handleEditGroup = (groupId: number) => {
    const group = studyGroups.find(g => g.id === groupId);
    if (group) {
      setEditingGroup(group);
      setShowAddModal(true);
    }
  };

  const handleUpdateGroup = async (formData: any) => {
    if (!editingGroup) return;

    try {
      const response = await authenticatedFetch(`http://localhost:3001/api/study-groups/${editingGroup.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      
      if (data.success) {
        alert('הקבוצה עודכנה בהצלחה!');
        setShowAddModal(false);
        setEditingGroup(null);
        fetchStudyGroups();
      } else {
        alert(`שגיאה: ${data.error}`);
      }
    } catch (error) {
      console.error('Error updating study group:', error);
      alert('אירעה שגיאה בעדכון הקבוצה');
    }
  };

  const handleDeleteGroup = async (groupId: number) => {
    if (!confirm('האם אתה בטוח שברצונך למחוק קבוצה זו?')) {
      return;
    }

    try {
      const response = await authenticatedFetch(`http://localhost:3001/api/study-groups/${groupId}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      
      if (data.success) {
        alert('הקבוצה נמחקה בהצלחה!');
        fetchStudyGroups();
      } else {
        alert(`שגיאה: ${data.error}`);
      }
    } catch (error) {
      console.error('Error deleting study group:', error);
      alert('אירעה שגיאה במחיקת הקבוצה');
    }
  };

  const handleScheduleGroups = async () => {
    if (selectedGroups.length === 0) {
      alert('נא לבחור לפחות קבוצה אחת לשיבוץ');
      return;
    }

    try {
      const response = await authenticatedFetch('http://localhost:3001/api/study-groups/schedule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          group_ids: selectedGroups,
          start_date: new Date().toISOString().split('T')[0],
          end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          force_schedule: false
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        setSchedulingResult(data.data);
        setShowSchedulingModal(true);
      } else {
        alert(`שגיאה בשיבוץ: ${data.error}`);
      }
    } catch (error) {
      console.error('Error scheduling groups:', error);
      alert('אירעה שגיאה בשיבוץ הקבוצות');
    }
  };

  const handleExportCalendar = async () => {
    try {
      const response = await authenticatedFetch('http://localhost:3001/api/study-groups/export-calendar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          group_ids: selectedGroups.length > 0 ? selectedGroups : studyGroups.map(g => g.id),
          format: 'ical',
          start_date: new Date().toISOString().split('T')[0],
          end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // Next 30 days
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        // Create and download the calendar file
        const calendarContent = data.data.calendar_content;
        const blob = new Blob([calendarContent], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `study_groups_calendar_${new Date().toISOString().split('T')[0]}.ics`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        alert('לוח שנה יוצא בהצלחה!');
      } else {
        alert(`שגיאה בייצוא לוח שנה: ${data.error}`);
      }
    } catch (error) {
      console.error('Error exporting calendar:', error);
      alert('אירעה שגיאה בייצוא לוח השנה');
    }
  };

  const getGroupTypeText = (type: string) => {
    const types: Record<string, string> = {
      'math': 'מתמטיקה',
      'english': 'אנגלית',
      'didactic': 'דידקטיקה',
      'other': 'אחר'
    };
    return types[type] || type;
  };

  const getGroupTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      'math': 'bg-blue-100 text-blue-800',
      'english': 'bg-green-100 text-green-800',
      'didactic': 'bg-purple-100 text-purple-800',
      'other': 'bg-gray-100 text-gray-800'
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  const getGradeColor = (grade: string) => {
    const colors: Record<string, string> = {
      'א': 'bg-red-100 text-red-800',
      'ב': 'bg-orange-100 text-orange-800',
      'ג': 'bg-yellow-100 text-yellow-800',
      'ד': 'bg-green-100 text-green-800',
      'ה': 'bg-blue-100 text-blue-800',
      'ו': 'bg-purple-100 text-purple-800'
    };
    return colors[grade] || 'bg-gray-100 text-gray-800';
  };

  const toggleGroupSelection = (groupId: number) => {
    setSelectedGroups(prev => 
      prev.includes(groupId) 
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

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
              <h1 className="text-2xl font-bold text-gray-900">ניהול הקבצות</h1>
              <p className="text-gray-600">ניהול הקבצות, שיבוץ אינטליגנטי ותצוגת לוחות זמנים</p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-blue-500 rounded-md flex items-center justify-center">
                        <span className="text-white font-semibold">📚</span>
                      </div>
                    </div>
                    <div className="mr-4 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">
                          כל ההקבצות
                        </dt>
                        <dd className="text-lg font-medium text-gray-900">{studyGroups.length}</dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-green-500 rounded-md flex items-center justify-center">
                        <span className="text-white font-semibold">🧮</span>
                      </div>
                    </div>
                    <div className="mr-4 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">
                          קבוצות מתמטיקה
                        </dt>
                        <dd className="text-lg font-medium text-gray-900">
                          {studyGroups.filter(g => g.group_type === 'math').length}
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-purple-500 rounded-md flex items-center justify-center">
                        <span className="text-white font-semibold">🇬🇧</span>
                      </div>
                    </div>
                    <div className="mr-4 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">
                          קבוצות אנגלית
                        </dt>
                        <dd className="text-lg font-medium text-gray-900">
                          {studyGroups.filter(g => g.group_type === 'english').length}
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-orange-500 rounded-md flex items-center justify-center">
                        <span className="text-white font-semibold">👥</span>
                      </div>
                    </div>
                    <div className="mr-4 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">
                          סך התלמידות
                        </dt>
                        <dd className="text-lg font-medium text-gray-900">
                          {studyGroups.reduce((acc, g) => acc + g.student_count, 0)}
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            {(isAdmin || isGroupCoordinator) && (
              <div className="bg-white shadow rounded-lg mb-6">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                    פעולות ניהול
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <button 
                      onClick={() => setShowAddModal(true)}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-3 rounded-md text-sm font-medium transition-colors"
                    >
                      הוסף קבוצה
                    </button>
                    <button 
                      onClick={handleScheduleGroups}
                      disabled={selectedGroups.length === 0}
                      className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-3 rounded-md text-sm font-medium transition-colors"
                    >
                      שבץ קבוצות נבחרות ({selectedGroups.length})
                    </button>
                    <button 
                      onClick={handleExportCalendar}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-md text-sm font-medium transition-colors"
                    >
                      ייצוא לוח שנה
                    </button>
                    <button className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-3 rounded-md text-sm font-medium transition-colors">
                      דוח ניצולת
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Study Groups Table */}
            <div className="bg-white shadow rounded-lg overflow-hidden">
              <div className="px-4 py-5 sm:p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">רשימת הקבצות</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <input
                          type="checkbox"
                          checked={selectedGroups.length === studyGroups.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedGroups(studyGroups.map(g => g.id));
                            } else {
                              setSelectedGroups([]);
                            }
                          }}
                          className="rounded"
                        />
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        שם קבוצה
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        סוג
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        שכבה
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        תלמידות
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        דרישות
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        פעולות
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {studyGroups.map((group) => (
                      <tr key={group.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={selectedGroups.includes(group.id)}
                            onChange={() => toggleGroupSelection(group.id)}
                            className="rounded"
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{group.name}</div>
                          <div className="text-xs text-gray-500">
                            נוצר: {new Date(group.created_at).toLocaleDateString('he-IL')}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getGroupTypeColor(group.group_type)}`}>
                            {getGroupTypeText(group.group_type)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getGradeColor(group.grade_level)}`}>
                            שכבה {group.grade_level}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {group.student_count} תלמידות
                          {group.is_large_group && (
                            <span className="mr-2 text-orange-600">👥</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {group.needs_projector && <span className="ml-2">📽</span>}
                          {group.consecutive_hours > 1 && (
                            <span className="mr-2 text-blue-600">{group.consecutive_hours} שעות רצופות</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          {(isAdmin || isGroupCoordinator) && (
                            <>
                              <button 
                                onClick={() => handleEditGroup(group.id)}
                                className="text-indigo-600 hover:text-indigo-900 ml-3"
                              >
                                ערוך
                              </button>
                              <button 
                                onClick={() => handleDeleteGroup(group.id)}
                                className="text-red-600 hover:text-red-900"
                              >
                                מחק
                              </button>
                            </>
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
      </div>

      {/* Add/Edit Group Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                {editingGroup ? 'עריכת קבוצה' : 'הוספת קבוצה חדשה'}
              </h3>
              <AddGroupForm 
                onSubmit={editingGroup ? handleUpdateGroup : handleAddGroup} 
                onCancel={() => {
                  setShowAddModal(false);
                  setEditingGroup(null);
                }} 
                editingGroup={editingGroup}
              />
            </div>
          </div>
        </div>
      )}

      {/* Scheduling Results Modal */}
      {showSchedulingModal && schedulingResult && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-2/3 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                תוצאות שיבוץ
              </h3>
              <SchedulingResults result={schedulingResult} />
              <div className="flex justify-end mt-6">
                <button
                  onClick={() => setShowSchedulingModal(false)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md"
                >
                  סגור
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AddGroupForm({ onSubmit, onCancel, editingGroup }: { 
  onSubmit: (data: any) => void; 
  onCancel: () => void; 
  editingGroup: StudyGroup | null;
}) {
  const [formData, setFormData] = useState({
    name: editingGroup?.name || '',
    group_type: editingGroup?.group_type || 'math' as const,
    grade_level: editingGroup?.grade_level || 'א' as const,
    student_count: editingGroup?.student_count || 1,
    needs_projector: editingGroup?.needs_projector || false,
    is_large_group: editingGroup?.is_large_group || false,
    consecutive_hours: editingGroup?.consecutive_hours || 1
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">שם קבוצה</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({...formData, name: e.target.value})}
          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">סוג קבוצה</label>
        <select
          value={formData.group_type}
          onChange={(e) => setFormData({...formData, group_type: e.target.value as any})}
          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
        >
          <option value="math">מתמטיקה</option>
          <option value="english">אנגלית</option>
          <option value="didactic">דידקטיקה</option>
          <option value="other">אחר</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">שכבה</label>
        <select
          value={formData.grade_level}
          onChange={(e) => setFormData({...formData, grade_level: e.target.value as any})}
          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
        >
          <option value="א">א</option>
          <option value="ב">ב</option>
          <option value="ג">ג</option>
          <option value="ד">ד</option>
          <option value="ה">ה</option>
          <option value="ו">ו</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">מספר תלמידות</label>
        <input
          type="number"
          value={formData.student_count}
          onChange={(e) => setFormData({...formData, student_count: parseInt(e.target.value)})}
          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
          min="1"
          required
        />
      </div>
      <div className="space-y-2">
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={formData.needs_projector}
            onChange={(e) => setFormData({...formData, needs_projector: e.target.checked})}
            className="ml-2 rounded"
          />
          <span className="mr-2 text-sm text-gray-700">נדרש מקרן</span>
        </label>
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={formData.is_large_group}
            onChange={(e) => setFormData({...formData, is_large_group: e.target.checked})}
            className="ml-2 rounded"
          />
          <span className="mr-2 text-sm text-gray-700">קבוצה גדולה</span>
        </label>
      </div>
      <div className="flex justify-end space-x-3 mt-6">
        <button
          type="button"
          onClick={onCancel}
          className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded-md"
        >
          ביטול
        </button>
        <button
          type="submit"
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md"
        >
          הוסף
        </button>
      </div>
    </form>
  );
}

function SchedulingResults({ result }: { result: SchedulingResult }) {
  return (
    <div className="space-y-4">
      <div className={`p-4 rounded-md ${result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
        <h4 className={`text-lg font-medium ${result.success ? 'text-green-800' : 'text-red-800'}`}>
          {result.success ? '✅ שיבוץ הצליח!' : '❌ שיבוץ נכשל'}
        </h4>
        <p className={`mt-2 ${result.success ? 'text-green-700' : 'text-red-700'}`}>
          {result.success 
            ? `${result.assignments.length} קבוצות שובצו בהצלחה`
            : `${result.unscheduled_groups.length} קבוצות לא שובצו עקב קונפליקטים`
          }
        </p>
      </div>

      {result.conflicts.length > 0 && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
          <h4 className="text-lg font-medium text-red-800">קונפליקטים שזוהו:</h4>
          <ul className="mt-2 list-disc list-inside text-red-700">
            {result.conflicts.map((conflict, index) => (
              <li key={index}>{conflict.message}</li>
            ))}
          </ul>
        </div>
      )}

      {result.warnings.length > 0 && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md">
          <h4 className="text-lg font-medium text-yellow-800">אזהרות:</h4>
          <ul className="mt-2 list-disc list-inside text-yellow-700">
            {result.warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
