"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { authenticatedFetch } from "../../lib/auth-backend-bridge";

interface Room {
  id: number;
  room_number: string;
  capacity: number;
  room_type: string;
  status: string;
}

export default function RoomRequestPage() {
  const { data: session } = useSession();
  const [formData, setFormData] = useState({
    activityType: "",
    grade: "",
    studentCount: "",
    date: "",
    startTime: "",
    endTime: "",
    specialRequirements: ""
  });
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(false);
  const [suggestedRoom, setSuggestedRoom] = useState<Room | null>(null);

  useEffect(() => {
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    try {
      const response = await authenticatedFetch('http://localhost:3001/api/rooms');
      const data = await response.json();
      
      if (data.success) {
        setRooms(data.data.rooms.filter((room: Room) => room.status === 'ACTIVE'));
      }
    } catch (error) {
      console.error('Error fetching rooms:', error);
    }
  };

  const findBestRoom = () => {
    const studentCount = parseInt(formData.studentCount);
    if (!studentCount || rooms.length === 0) return null;

    // Find rooms that can accommodate the students
    const suitableRooms = rooms.filter(room => room.capacity >= studentCount);
    
    if (suitableRooms.length === 0) return null;

    // Prefer rooms with capacity closest to the group size
    return suitableRooms.reduce((best, current) => {
      const bestDiff = best.capacity - studentCount;
      const currentDiff = current.capacity - studentCount;
      return currentDiff < bestDiff ? current : best;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Find the best room for this request
      const bestRoom = findBestRoom();
      
      const requestData = {
        activity_type: formData.activityType,
        grade: formData.grade,
        student_count: parseInt(formData.studentCount),
        date: formData.date,
        start_time: formData.startTime,
        end_time: formData.endTime,
        special_requirements: formData.specialRequirements,
        requested_room_id: bestRoom?.id || null,
        requester_id: session?.user?.id,
        status: 'pending'
      };

      const response = await authenticatedFetch('http://localhost:3001/api/room-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestData),
      });

      const data = await response.json();
      
      if (data.success) {
        alert('בקשת חדר נשלחה בהצלחה! המערכת תעדכן אותך כאשר החדר יאושר.');
        
        // Reset form
        setFormData({
          activityType: "",
          grade: "",
          studentCount: "",
          date: "",
          startTime: "",
          endTime: "",
          specialRequirements: ""
        });
        setSuggestedRoom(null);
      } else {
        alert(`שגיאה: ${data.error}`);
      }
    } catch (error) {
      console.error('Error submitting room request:', error);
      alert('אירעה שגיאה בשליחת הבקשה. אנא נסה שוב.');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Auto-suggest room when student count changes
    if (field === 'studentCount' && value) {
      const newFormData = { ...formData, [field]: value };
      setFormData(newFormData);
      setSuggestedRoom(findBestRoom());
    }
  };

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">בקשת חדר</h1>
          
          <div className="bg-white shadow rounded-lg p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    סוג פעילות
                  </label>
                  <select
                    value={formData.activityType}
                    onChange={(e) => handleInputChange("activityType", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  >
                    <option value="">בחר סוג פעילות</option>
                    <option value="lesson">שיעור</option>
                    <option value="study_group">הקבצה</option>
                    <option value="meeting">פגישה</option>
                    <option value="exam">מבחן</option>
                    <option value="event">אירוע</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    שכבה
                  </label>
                  <select
                    value={formData.grade}
                    onChange={(e) => handleInputChange("grade", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  >
                    <option value="">בחר שכבה</option>
                    <option value="א">א'</option>
                    <option value="ב">ב'</option>
                    <option value="ג">ג'</option>
                    <option value="ד">ד'</option>
                    <option value="ה">ה'</option>
                    <option value="ו">ו'</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    מספר תלמידים
                  </label>
                  <input
                    type="number"
                    value={formData.studentCount}
                    onChange={(e) => handleInputChange("studentCount", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="הכנס מספר תלמידים"
                    min="1"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    תאריך
                  </label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => handleInputChange("date", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    min={new Date().toISOString().split('T')[0]}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    שעת התחלה
                  </label>
                  <input
                    type="time"
                    value={formData.startTime}
                    onChange={(e) => handleInputChange("startTime", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    שעת סיום
                  </label>
                  <input
                    type="time"
                    value={formData.endTime}
                    onChange={(e) => handleInputChange("endTime", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>
              </div>

              {/* Special Requirements */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  דרישות מיוחדות (לא חובה)
                </label>
                <textarea
                  value={formData.specialRequirements}
                  onChange={(e) => handleInputChange("specialRequirements", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  rows={3}
                  placeholder="לדוגמה: נדרש מקרן, חדר ממוזג, גישה לנכים..."
                />
              </div>

              {/* Room Suggestion */}
              {suggestedRoom && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-medium text-green-800">🎯 חדר מומלץ</h4>
                      <p className="text-sm text-green-700 mt-1">
                        {suggestedRoom.room_number} (תכולה: {suggestedRoom.capacity} תלמידים)
                      </p>
                    </div>
                    <div className="text-xs text-green-600">
                      התאמה מיטבית לגודל הקבוצה
                    </div>
                  </div>
                </div>
              )}

              {!suggestedRoom && formData.studentCount && parseInt(formData.studentCount) > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="text-sm text-yellow-800">
                    ⚠️ לא נמצא חדר מתאים למספר התלמידים שצוין. הבקשה תישלח לאישור ידני.
                  </p>
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>✨ המערכת תמצא את החדר הטוב ביותר עבורך</strong>
                  <br />
                  הקצאה מבוססת על: גודל חדר, זמינות, סוג פעילות ועדיפויות
                </p>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-md font-medium transition-colors"
                >
                  {loading ? 'שולח בקשה...' : 'שלח בקשה'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
