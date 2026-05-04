"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { authenticatedFetch } from "../../lib/auth-backend-bridge";

interface Homeroom {
  id: number;
  room_id: number;
  grade_name: string;
  class_number: number;
  teacher_name?: string;
  teacher_email?: string;
  room_number: string;
  room_type: string;
  floor: number;
  wing: string;
  max_students: number;
  current_students: number;
  school_year: string;
  is_active: boolean;
  display_name: string;
}

interface Grade {
  id: number;
  name: string;
  coordinator_name?: string;
  coordinator_email?: string;
}

export default function HomeroomsPage() {
  const { data: session } = useSession();
  const [homerooms, setHomerooms] = useState<Homeroom[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [filteredRooms, setFilteredRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedGrade, setSelectedGrade] = useState('');
  const [selectedRoom, setSelectedRoom] = useState('');
  const [selectedClassNumber, setSelectedClassNumber] = useState('');
  const [editingHomeroom, setEditingHomeroom] = useState<Homeroom | null>(null);

  const isAdmin = session?.user?.role === 'admin';
  const isGradeCoordinator = session?.user?.role === 'grade_coordinator';

  useEffect(() => {
    fetchHomerooms();
    fetchGrades();
  }, []);

  const fetchHomerooms = async () => {
    try {
      const response = await authenticatedFetch('http://localhost:3001/api/homerooms');
      const data = await response.json();
      
      if (data.success) {
        setHomerooms(data.data.homerooms);
      } else {
        console.error('Failed to fetch homerooms:', data.error);
      }
    } catch (error) {
      console.error('Error fetching homerooms:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchGrades = async () => {
    try {
      const response = await authenticatedFetch('http://localhost:3001/api/grades');
      const data = await response.json();
      
      console.log('Raw grades response:', data);
      
      // Handle the response format from the API
      if (data.success && data.data && data.data.grades) {
        console.log('Grades array received:', data.data.grades);
        setGrades(data.data.grades);
      } else if (Array.isArray(data)) {
        console.log('Grades array received directly:', data);
        setGrades(data);
      } else {
        console.error('Unexpected grades response format:', data);
        // Add fallback data for testing
        setGrades([
          { id: 1, name: 'א' },
          { id: 2, name: 'ב' },
          { id: 3, name: 'ג' },
          { id: 4, name: 'ד' },
          { id: 5, name: 'ה' },
          { id: 6, name: 'ו' }
        ]);
      }
    } catch (error) {
      console.error('Error fetching grades:', error);
      // Add fallback data for testing
      setGrades([
        { id: 1, name: 'א' },
        { id: 2, name: 'ב' },
        { id: 3, name: 'ג' },
        { id: 4, name: 'ד' },
        { id: 5, name: 'ה' },
        { id: 6, name: 'ו' }
      ]);
    }
  };

  const fetchFilteredRooms = async (gradeId: string) => {
    if (!gradeId) {
      setFilteredRooms([]);
      return;
    }

    try {
      const schoolYear = 'תשפ"ד'; // You might want to make this dynamic
      const response = await authenticatedFetch(`http://localhost:3001/api/homerooms/available-rooms?grade_id=${gradeId}&school_year=${encodeURIComponent(schoolYear)}`);
      const data = await response.json();
      
      if (data.success) {
        setFilteredRooms(data.data.available_rooms);
      } else {
        console.error('Failed to fetch filtered rooms:', data.error);
        setFilteredRooms([]);
      }
    } catch (error) {
      console.error('Error fetching filtered rooms:', error);
      setFilteredRooms([]);
    }
  };

  const handleGradeChange = (gradeId: string) => {
    console.log('Grade changed to:', gradeId);
    setSelectedGrade(gradeId);
    setSelectedRoom(''); // Reset room selection when grade changes
    setSelectedClassNumber(''); // Reset class number selection when grade changes
    fetchFilteredRooms(gradeId);
  };

  const handleAddHomeroom = async () => {
    console.log('Form values:', { selectedGrade, selectedRoom, selectedClassNumber });
    
    if (!selectedGrade || !selectedRoom || !selectedClassNumber) {
      alert('אנא מלא את כל השדות הנדרשים');
      return;
    }

    const room_id = selectedRoom; // Keep as UUID string
    const grade_id = selectedGrade; // Keep as UUID string
    const class_number = parseInt(selectedClassNumber);
    
    console.log('Parsed values:', { room_id, grade_id, class_number });
    
    if (isNaN(class_number) || !room_id || !grade_id) {
      alert('ערכים לא תקינים. אנא בדוק את הבחירות.');
      return;
    }

    const requestData = {
      room_id,
      grade_id,
      class_number,
      max_students: 35,
      school_year: 'תשפ"ד'
    };
    
    console.log('Sending request data:', requestData);

    try {
      const response = await authenticatedFetch('http://localhost:3001/api/homerooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      });

      const data = await response.json();
      
      if (data.success) {
        alert('כיתת אם נוספה בהצלחה!');
        setShowAddModal(false);
        setSelectedGrade('');
        setSelectedRoom('');
        setSelectedClassNumber('');
        setFilteredRooms([]);
        fetchHomerooms();
      } else {
        alert(`שגיאה: ${data.error}`);
      }
    } catch (error) {
      console.error('Error adding homeroom:', error);
      alert('אירעה שגיאה בהוספת כיתת אם');
    }
  };

  const handleEditHomeroom = (homeroomId: number) => {
    const homeroom = homerooms.find(h => h.id === homeroomId);
    if (homeroom) {
      setEditingHomeroom(homeroom);
      const gradeId = grades.find(g => g.name === homeroom.grade_name)?.id?.toString() || '';
      setSelectedGrade(gradeId);
      setSelectedRoom(homeroom.room_id.toString());
      setSelectedClassNumber(homeroom.class_number.toString());
      fetchFilteredRooms(gradeId); // Fetch filtered rooms for the selected grade
      setShowAddModal(true);
    }
  };

  const handleUpdateHomeroom = async () => {
    if (!editingHomeroom || !selectedGrade || !selectedRoom) {
      alert('נא לבחור שכבה וחדר');
      return;
    }

    try {
      const response = await authenticatedFetch(`http://localhost:3001/api/homerooms/${editingHomeroom.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          room_id: selectedRoom, // Keep as string
          grade_id: selectedGrade, // Keep as string
          class_number: editingHomeroom.class_number,
          max_students: editingHomeroom.max_students,
          school_year: editingHomeroom.school_year
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        alert('כיתת אם עודכנה בהצלחה!');
        setShowAddModal(false);
        setEditingHomeroom(null);
        setSelectedGrade('');
        setSelectedRoom('');
        setFilteredRooms([]);
        fetchHomerooms();
      } else {
        alert(`שגיאה: ${data.error}`);
      }
    } catch (error) {
      console.error('Error updating homeroom:', error);
      alert('אירעה שגיאה בעדכון כיתת האם');
    }
  };

  const handleDeleteHomeroom = async (homeroomId: number) => {
    console.log('Attempting to delete homeroom with ID:', homeroomId, 'Type:', typeof homeroomId);
    
    if (!confirm('האם אתה בטוח שברצונך למחוק כיתת אם זו?')) {
      return;
    }

    try {
      const url = `http://localhost:3001/api/homerooms/${homeroomId}`;
      console.log('DELETE URL:', url);
      
      const response = await authenticatedFetch(url, {
        method: 'DELETE',
      });

      const data = await response.json();
      
      if (data.success) {
        alert('כיתת אם נמחקה בהצלחה!');
        fetchHomerooms();
      } else {
        alert(`שגיאה: ${data.error}`);
      }
    } catch (error) {
      console.error('Error deleting homeroom:', error);
      alert('אירעה שגיאה במחיקת כיתת האם');
    }
  };

  const handleAssignTeacher = async (homeroomId: number) => {
    const teacherEmail = prompt('אימייל מורה:');
    if (!teacherEmail) return;

    try {
      const response = await authenticatedFetch(`http://localhost:3001/api/homerooms/${homeroomId}/assign-teacher`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          teacher_id: 1 // יש למצוא לפי אימייל
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        alert('מורה הוקצה בהצלחה!');
        fetchHomerooms();
      } else {
        alert(`שגיאה: ${data.error}`);
      }
    } catch (error) {
      console.error('Error assigning teacher:', error);
      alert('אירעה שגיאה בהקצאת המורה');
    }
  };

  const handleUtilizationReport = async () => {
    try {
      const response = await authenticatedFetch('http://localhost:3001/api/homerooms/utilization-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          format: 'csv',
          include_details: true
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        // Create CSV content
        let csvContent = '\uFEFF'; // UTF-8 BOM for Hebrew
        csvContent += 'שם כיתה,חדר,תכולה,תלמידים נוכחיים,ניצולת (%),מורה,סטטוס\n';
        
        homerooms.forEach(homeroom => {
          const utilization = Math.round((homeroom.current_students / homeroom.max_students) * 100);
          csvContent += `"${homeroom.display_name}","${homeroom.room_number}",${homeroom.max_students},${homeroom.current_students},${utilization}%,"${homeroom.teacher_name || 'לא הוקצה'}","${homeroom.is_active ? 'פעילה' : 'לא פעילה'}"\n`;
        });
        
        // Add summary
        const totalCapacity = homerooms.reduce((sum, h) => sum + h.max_students, 0);
        const totalStudents = homerooms.reduce((sum, h) => sum + h.current_students, 0);
        const overallUtilization = totalCapacity > 0 ? Math.round((totalStudents / totalCapacity) * 100) : 0;
        
        csvContent += '\nסיכום\n';
        csvContent += `"סך כיתות אם",${homerooms.length}\n`;
        csvContent += `"סך תכולה",${totalCapacity}\n`;
        csvContent += `"סך תלמידים",${totalStudents}\n`;
        csvContent += `"ניצולת כללית","${overallUtilization}%"\n`;
        
        // Download the file
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `homerooms_utilization_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        alert('דוח תפוסה יוצא בהצלחה!');
      } else {
        alert(`שגיאה בייצוא דוח: ${data.error}`);
      }
    } catch (error) {
      console.error('Error generating utilization report:', error);
      alert('אירעה שגיאה ביצירת הדוח');
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

  const getRoomTypeText = (roomType: string) => {
    const types: Record<string, string> = {
      'CLASSROOM_A': 'כיתת אם א',
      'CLASSROOM_B': 'כיתת אם ב',
      'CLASSROOM_C': 'כיתת אם ג',
      'CLASSROOM_D': 'כיתת אם ד',
      'CLASSROOM_E': 'כיתת אם ה',
      'CLASSROOM_F': 'כיתת אם ו',
      'CLASSROOM_G': 'כיתת אם ז',
      'CLASSROOM_H': 'כיתת אם ח',
      'CLASSROOM_I': 'כיתת אם ט',
      'CLASSROOM_J': 'כיתת אם י',
      'CLASSROOM_K': 'כיתת אם כ',
      'CLASSROOM_L': 'כיתת אם ל',
      'CLASSROOM_M': 'כיתת אם מ',
      'CLASSROOM_N': 'כיתת אם נ',
      'CLASSROOM_S': 'כיתת אם ס',
      'CLASSROOM_EIN': 'כיתת אם ע',
      'CLASSROOM_P': 'כיתת אם פ',
      'CLASSROOM_TZADI': 'כיתת אם צ',
      'CLASSROOM_KUF': 'כיתת אם ק',
      'CLASSROOM_RESH': 'כיתת אם ר',
      'CLASSROOM_SHIN': 'כיתת אם ש',
      'CLASSROOM_TAV': 'כיתת אם ת',
      'MAMAD': 'ממ"ד',
      'HOMEROOM': 'כיתת אם',
      'REGULAR': 'כיתה רגילה',
      'AUDITORIUM': 'אולם גדול',
      'MUSIC': 'חדר מוזיקה',
      'LIBRARY': 'ספריה',
      'HAGBAA': 'חגבא',
      'CARAVAN': 'קרוון',
      'COORDINATOR': 'חדר רכז',
      'ATTIC': 'עלייה',
      'ALBEK': 'אלבק'
    };
    return types[roomType] || roomType;
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
              <h1 className="text-2xl font-bold text-gray-900">ניהול כיתות אם ושכבות</h1>
              <p className="text-gray-600">צפייה וניהול כיתות אם, הקצאת מורים וניהול שכבות</p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-blue-500 rounded-md flex items-center justify-center">
                        <span className="text-white font-semibold">🏫</span>
                      </div>
                    </div>
                    <div className="mr-4 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">
                          כל כיתות האם
                        </dt>
                        <dd className="text-lg font-medium text-gray-900">{homerooms.length}</dd>
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
                        <span className="text-white font-semibold">👨‍🏫</span>
                      </div>
                    </div>
                    <div className="mr-4 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">
                          מורים מוקצים
                        </dt>
                        <dd className="text-lg font-medium text-gray-900">
                          {homerooms.filter(h => h.teacher_name).length}
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
                        <span className="text-white font-semibold">📊</span>
                      </div>
                    </div>
                    <div className="mr-4 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">
                          ניצולת מקומות
                        </dt>
                        <dd className="text-lg font-medium text-gray-900">
                          {homerooms.length > 0 
                            ? Math.round((homerooms.reduce((acc, h) => acc + h.current_students, 0) / 
                                homerooms.reduce((acc, h) => acc + h.max_students, 0)) * 100)
                            : 0}%
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            {(isAdmin || isGradeCoordinator) && (
              <div className="bg-white shadow rounded-lg mb-6">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                    פעולות ניהול
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <button 
                      onClick={() => setShowAddModal(true)}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-3 rounded-md text-sm font-medium transition-colors"
                    >
                      הוסף כיתת אם
                    </button>
                    <button 
                      onClick={() => window.location.href = '/grades'}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-md text-sm font-medium transition-colors"
                    >
                      ניהול שכבות
                    </button>
                    <button 
                      onClick={handleUtilizationReport}
                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-md text-sm font-medium transition-colors"
                    >
                      דוח תפוסה
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Homerooms Table */}
            <div className="bg-white shadow rounded-lg overflow-hidden">
              <div className="px-4 py-5 sm:p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">רשימת כיתות אם</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        כיתה
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        חדר
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        מורה
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        תלמידים
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        סטטוס
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        פעולות
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {homerooms.map((homeroom) => (
                      <tr key={homeroom.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getGradeColor(homeroom.grade_name)}`}>
                              {homeroom.display_name}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <div>
                            <div className="text-sm font-medium">{homeroom.room_number}</div>
                            <div className="text-xs text-gray-500">{getRoomTypeText(homeroom.room_type)}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {homeroom.teacher_name ? (
                            <div>
                              <div className="text-sm font-medium">{homeroom.teacher_name}</div>
                              <div className="text-xs text-gray-500">{homeroom.teacher_email}</div>
                            </div>
                          ) : (
                            <span className="text-red-600">לא הוקצה מורה</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div className="flex items-center">
                            <span>{homeroom.current_students}/{homeroom.max_students}</span>
                            <div className="mr-2 w-16 bg-gray-200 rounded-full h-2">
                              <div 
                                className="bg-blue-600 h-2 rounded-full" 
                                style={{ width: `${(homeroom.current_students / homeroom.max_students) * 100}%` }}
                              ></div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            homeroom.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {homeroom.is_active ? 'פעילה' : 'לא פעילה'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          {(isAdmin || isGradeCoordinator) && (
                            <>
                              {!homeroom.teacher_name && (
                                <button 
                                  onClick={() => handleAssignTeacher(homeroom.id)}
                                  className="text-blue-600 hover:text-blue-900 ml-3"
                                >
                                  הקצה מורה
                                </button>
                              )}
                              <button 
                                onClick={() => handleEditHomeroom(homeroom.id)}
                                className="text-indigo-600 hover:text-indigo-900 ml-3"
                              >
                                ערוך
                              </button>
                              <button 
                                onClick={() => handleDeleteHomeroom(homeroom.id)}
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

      {/* Add/Edit Homeroom Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                {editingHomeroom ? 'עריכת כיתת אם' : 'הוספת כיתת אם חדשה'}
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">שכבה</label>
                  <select
                    value={selectedGrade}
                    onChange={(e) => handleGradeChange(e.target.value)}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                  >
                    <option value="">בחר שכבה</option>
                    {grades.map((grade) => (
                      <option key={grade.id} value={grade.id}>
                        שכבה {grade.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">מספר כיתה</label>
                  <select
                    value={selectedClassNumber}
                    onChange={(e) => setSelectedClassNumber(e.target.value)}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                  >
                    <option value="">בחר מספר כיתה</option>
                    {[1, 2, 3, 4, 5, 6, 7].map((num) => (
                      <option key={num} value={num}>
                        כיתה {num}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">חדר</label>
                  <select
                    value={selectedRoom}
                    onChange={(e) => setSelectedRoom(e.target.value)}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                    disabled={!selectedGrade}
                  >
                    <option value="">בחר חדר</option>
                    {filteredRooms.map((room) => (
                      <option key={room.id} value={room.id}>
                        {room.room_number} (תכולה: {room.capacity})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingHomeroom(null);
                    setSelectedGrade('');
                    setSelectedRoom('');
                    setSelectedClassNumber('');
                    setFilteredRooms([]);
                  }}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded-md"
                >
                  ביטול
                </button>
                <button
                  onClick={editingHomeroom ? handleUpdateHomeroom : handleAddHomeroom}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md"
                >
                  {editingHomeroom ? 'עדכן' : 'הוסף'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
