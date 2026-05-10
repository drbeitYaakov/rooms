"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { authenticatedFetch } from "@/lib/auth-backend-bridge";

interface Assignment {
  id: string;
  title?: string;
  activity_type?: string;
  date: string;
  start_time: string;
  end_time: string;
}

interface Conflict {
  id: string;
  room_number: string;
  date: string;
  time: string;
  assignments?: Assignment[];
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://rooms-ma9h.onrender.com";

export default function OverrideRulesPage() {
  const router = useRouter();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchAssignments();
    fetchConflicts();
  }, []);

  const fetchAssignments = async () => {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/api/assignments`);
      if (response.ok) {
        const data = await response.json();
        setAssignments(data.data.assignments);
      }
    } catch (error) {
      console.error('Error fetching assignments:', error);
    }
  };

  const fetchConflicts = async () => {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/api/assignments/conflicts`);
      if (response.ok) {
        const data = await response.json();
        setConflicts(data.data.conflicts || []);
      }
    } catch (error) {
      console.error('Error fetching conflicts:', error);
    }
  };

  const handleOverride = async () => {
    if (!selectedAssignment || !overrideReason) {
      alert('נא לבחור שיבוץ ולספק סיבה לדריסה');
      return;
    }

    setLoading(true);
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/api/assignments/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignment_id: selectedAssignment.id,
          override_reason: overrideReason
        })
      });

      if (response.ok) {
        alert('הדריסה בוצעה בהצלחה!');
        setSelectedAssignment(null);
        setOverrideReason("");
        fetchAssignments();
        fetchConflicts();
      } else {
        alert('שגיאה בביצוע דריסה');
      }
    } catch (error) {
      console.error('Error overriding:', error);
      alert('שגיאה בביצוע דריסה');
    } finally {
      setLoading(false);
    }
  };

  const handleResolveConflict = async (conflictId: string, resolution: string) => {
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/api/assignments/resolve-conflict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conflict_id: conflictId,
          resolution: resolution
        })
      });

      if (response.ok) {
        alert('ההתנגשות נפתרה בהצלחה!');
        fetchConflicts();
      } else {
        alert('שגיאה בפתרון התנגשות');
      }
    } catch (error) {
      console.error('Error resolving conflict:', error);
      alert('שגיאה בפתרון התנגשות');
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
            <h1 className="text-2xl font-bold text-gray-900">דריסת חוקים</h1>
            <p className="text-gray-600">נהל התנגשויות ובצע דריסות שיבוץ</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* התנגשויות פעילות */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4">התנגשויות פעילות</h2>
              <div className="space-y-3">
                {conflicts.length === 0 ? (
                  <p className="text-gray-500">אין התנגשויות פעילות</p>
                ) : (
                  conflicts.map((conflict) => (
                    <div key={conflict.id} className="border border-red-200 rounded-md p-3 bg-red-50">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-medium text-red-800">התנגשות בחדר {conflict.room_number}</p>
                          <p className="text-sm text-red-600">
                            {conflict.date} | {conflict.time}
                          </p>
                        </div>
                      </div>
                      <div className="text-sm text-gray-700 mb-2">
                        <p>שיבוצים מתנגשים:</p>
                        <ul className="list-disc list-inside">
                          {conflict.assignments?.map((assignment, index: number) => (
                            <li key={index}>{assignment.title || assignment.activity_type}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleResolveConflict(conflict.id, 'keep_first')}
                          className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded"
                        >
                          שמור ראשון
                        </button>
                        <button
                          onClick={() => handleResolveConflict(conflict.id, 'keep_second')}
                          className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded"
                        >
                          שמור שני
                        </button>
                        <button
                          onClick={() => handleResolveConflict(conflict.id, 'cancel_both')}
                          className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded"
                        >
                          בטל שניהם
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* דריסת שיבוץ */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4">דריסת שיבוץ קיים</h2>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  בחר שיבוץ לדריסה
                </label>
                <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-200 rounded-md p-2">
                  {assignments.map((assignment) => (
                    <div
                      key={assignment.id}
                      onClick={() => setSelectedAssignment(assignment)}
                      className={`p-2 rounded cursor-pointer ${
                        selectedAssignment?.id === assignment.id
                          ? 'bg-blue-100 border-blue-500'
                          : 'hover:bg-gray-100'
                      }`}
                    >
                      <p className="font-medium">{assignment.title || assignment.activity_type}</p>
                      <p className="text-sm text-gray-600">
                        {assignment.date} | {assignment.start_time} - {assignment.end_time}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  סיבת הדריסה
                </label>
                <textarea
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
                  rows={3}
                  placeholder="פרט את הסיבה לדריסת החוקים..."
                  required
                />
              </div>

              <button
                onClick={handleOverride}
                disabled={loading || !selectedAssignment || !overrideReason}
                className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-md font-medium"
              >
                {loading ? 'מבצע דריסה...' : 'בצע דריסה'}
              </button>

              {selectedAssignment && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                  <p className="text-sm text-yellow-800">
                    <strong>שיבוץ נבחר:</strong> {selectedAssignment.title || selectedAssignment.activity_type}
                    <br />
                    {selectedAssignment.date} | {selectedAssignment.start_time} - {selectedAssignment.end_time}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* היסטוריית דריסות */}
          <div className="mt-6 bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">היסטוריית דריסות</h2>
            <div className="space-y-2">
              <p className="text-gray-500">אין היסטוריית דריסות להצגה</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
