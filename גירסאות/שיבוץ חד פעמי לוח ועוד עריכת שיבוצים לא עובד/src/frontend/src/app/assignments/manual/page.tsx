"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { authenticatedFetch } from "@/lib/auth-backend-bridge";
import HebrewDateField from "@/components/HebrewDateField";
import { formatHebrewDate } from "@/lib/hebrewDate";

export default function ManualAssignmentPage() {
  const router = useRouter();
  const [rooms, setRooms] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [formData, setFormData] = useState<{
    room_id: string;
    date: string;
    start_time: string;
    end_time: string;
    activity_type: string;
    assignment_type: "one_time" | "recurring";
    assignable_type: string;
    days_of_week: number[];
    end_date: string;
  }>({
    room_id: "",
    date: "",
    start_time: "",
    end_time: "",
    activity_type: "",
    assignment_type: "one_time", // one_time or recurring
    assignable_type: "meeting", // meeting, study_group, event, etc.
    days_of_week: [], // For recurring assignments
    end_date: "" // For recurring assignments
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchRooms();
    fetchAssignments();
  }, []);

  const fetchRooms = async () => {
    try {
      const response = await authenticatedFetch('/api/rooms');
      if (response.ok) {
        const data = await response.json();
        console.log('Rooms data received:', data);
        setRooms(data.data.rooms);
      } else {
        console.error('Failed to fetch rooms:', response.status);
      }
    } catch (error) {
      console.error('Error fetching rooms:', error);
    }
  };

  const fetchAssignments = async () => {
    try {
      const response = await authenticatedFetch('/api/assignments');
      if (response.ok) {
        const data = await response.json();
        setAssignments(data.data.assignments);
      }
    } catch (error) {
      console.error('Error fetching assignments:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Validate form data
    if (!formData.room_id || formData.room_id === "") {
      alert('אנא בחר חדר');
      setLoading(false);
      return;
    }

    if (!formData.date || formData.date === "") {
      alert('אנא בחר תאריך');
      setLoading(false);
      return;
    }

    if (!formData.start_time || formData.start_time === "") {
      alert('אנא בחר שעת התחלה');
      setLoading(false);
      return;
    }

    if (!formData.end_time || formData.end_time === "") {
      alert('אנא בחר שעת סיום');
      setLoading(false);
      return;
    }

    // Validate recurring assignment fields
    if (formData.assignment_type === 'recurring') {
      if (formData.days_of_week.length === 0) {
        alert('אנא בחר לפחות יום אחד בשבוע');
        setLoading(false);
        return;
      }
      
      if (!formData.end_date || formData.end_date === "") {
        alert('אנא בחר תאריך סיום לשיבוץ התדיר');
        setLoading(false);
        return;
      }
    }

    console.log('Form data being sent:', formData);

    try {
      const response = await authenticatedFetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          type: formData.assignment_type,
          assignable_type: "meeting",  // ← Use "meeting" for assignable_type (valid)
          assignable_id: "manual",
          is_manual: true,  // ← Explicitly mark as manual
          activity_type: formData.activity_type,  // ← Use what the user actually selected!
          specific_date: formData.date,
          days_of_week: formData.assignment_type === 'recurring' ? formData.days_of_week : [],
          time_slots: [{ start: formData.start_time, end: formData.end_time }],
          date: formData.date,
          start_time: formData.start_time,
          end_time: formData.end_time,
          end_date: formData.end_date || null
        })
      });

      if (response.ok) {
        alert('השיבוץ נוצר בהצלחה!');
        setFormData({
          room_id: "",
          date: "",
          start_time: "",
          end_time: "",
          activity_type: "",
          assignment_type: "one_time",
          assignable_type: "meeting",
          days_of_week: [],
          end_date: ""
        });
        fetchAssignments();
      } else {
        const errorData = await response.json();
        const errorMessage = errorData.error || errorData.explanation || 'שגיאה ביצירת שיבוץ';
        alert(errorMessage);
      }
    } catch (error) {
      console.error('Error creating assignment:', error);
      alert('שגיאה ביצירת שיבוץ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="mb-6">
            <button
              onClick={() => router.back()}
              className="text-blue-600 hover:text-blue-800 mb-4"
            >
              ← חזור
            </button>
            <h1 className="text-2xl font-bold text-gray-900">שיבוץ ידני</h1>
            <p className="text-gray-600">צור שיבוץ ידני לחדר וזמן ספציפיים</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* טופס שיבוץ */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4">יצירת שיבוץ חדש</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    חדר
                  </label>
                  <select
                    value={formData.room_id}
                    onChange={(e) => setFormData({ ...formData, room_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
                    required
                  >
                    <option value="">בחר חדר</option>
                    {rooms.map((room: any) => (
                      <option key={room.id} value={room.id}>
                        {room.room_number} - {room.room_type}
                      </option>
                    ))}
                  </select>
                </div>

                <HebrewDateField
                  label="תאריך"
                  value={formData.date}
                  onChange={(value) => setFormData({ ...formData, date: value })}
                  required
                  inputClassName="mt-3 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
                />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      שעת התחלה
                    </label>
                    <input
                      type="time"
                      value={formData.start_time}
                      onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      שעת סיום
                    </label>
                    <input
                      type="time"
                      value={formData.end_time}
                      onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    סוג שיבוץ
                  </label>
                  <select
                    value={formData.assignable_type}
                    onChange={(e) => setFormData({ ...formData, assignable_type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
                    required
                  >
                    <option value="">בחר סוג שיבוץ</option>
                    <option value="personal_meeting">פגישה</option>
                    <option value="study_group">הקבצה</option>
                    <option value="event">אירוע</option>
                    <option value="didactics">הרצאה</option>
                    <option value="exam_makeup">מבחן חוזר</option>
                    <option value="camp_prep">הכנה למחנה</option>
                    <option value="PE">התעמלות</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    סוג תדירות
                  </label>
                  <select
                    value={formData.assignment_type}
                    onChange={(e) => {
                    const value = e.target.value as "one_time" | "recurring";
                    setFormData({ ...formData, assignment_type: value });
                  }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
                    required
                  >
                    <option value="one_time">חד פעם</option>
                    <option value="recurring">תדיר</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    סוג פעילות
                  </label>
                  <select
                    value={formData.activity_type}
                    onChange={(e) => setFormData({ ...formData, activity_type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
                    required
                  >
                    <option value="">בחר סוג פעילות</option>
                    <option value="didactics">שיעור</option>
                    <option value="personal_meeting">פגישה</option>
                    <option value="event">אירוע</option>
                    <option value="study_group">הקבצה</option>
                  </select>
                </div>

                {/* Fields for recurring assignments */}
                {formData.assignment_type === 'recurring' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        ימים בשבוע
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'].map((day, index) => (
                          <label key={index} className="flex items-center">
                            <input
                              type="checkbox"
                              checked={formData.days_of_week.includes(index)}
                              onChange={(e) => {
                                const newDays = e.target.checked 
                                  ? [...formData.days_of_week, index] 
                                  : formData.days_of_week.filter((d: number) => d !== index);
                                setFormData({ ...formData, days_of_week: newDays });
                              }}
                              className="ml-2"
                            />
                            {day}
                          </label>
                        ))}
                      </div>
                    </div>

                    <HebrewDateField
                      label="תאריך סיום"
                      value={formData.end_date}
                      onChange={(value) => setFormData({ ...formData, end_date: value })}
                      required={formData.assignment_type === "recurring"}
                      inputClassName="mt-3 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
                    />
                  </>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-md font-medium"
                >
                  {loading ? 'יוצר שיבוץ...' : 'צור שיבוץ'}
                </button>
              </form>
            </div>

            {/* רשימת שיבוצים קיימים */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4">שיבוצים קיימים</h2>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {assignments.length === 0 ? (
                  <p className="text-gray-500">אין שיבוצים קיימים</p>
                ) : (
                  assignments.map((assignment: any) => (
                    <div key={assignment.id} className="border border-gray-200 rounded-md p-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium">{assignment.title || assignment.activity_type}</p>
                          <p className="text-sm text-gray-600">
                            {formatHebrewDate(assignment.date, { includeWeekday: true }) || assignment.date} | {assignment.start_time} - {assignment.end_time}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            if (confirm('למחוק שיבוץ זה?')) {
                              // TODO: Implement delete functionality
                            }
                          }}
                          className="text-red-600 hover:text-red-800 text-sm"
                        >
                          מחק
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
