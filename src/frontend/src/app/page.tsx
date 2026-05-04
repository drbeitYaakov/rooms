"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { signOut } from "next-auth/react";
import Link from "next/link";

export default function HomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const handleQuickAction = (action: string) => {
    switch (action) {
      case 'manual-assignment':
        router.push('/assignments/manual');
        break;
      case 'override-rules':
        router.push('/assignments/override');
        break;
      case 'view-conflicts':
        router.push('/reports');
        break;
      case 'create-reports':
        router.push('/reports');
        break;
      default:
        console.log('Unknown action:', action);
    }
  };

  useEffect(() => {
    if (status === "loading") return;
    if (!session) {
      router.push("/login");
    }
  }, [session, status, router]);

  if (status === "loading") {
    return <div>Loading...</div>;
  }

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">
                מערכת שיבוץ חכמה
              </h1>
            </div>
            <div className="flex items-center space-x-4 space-x-reverse">
              <span className="text-sm text-gray-700">
                {session.user?.name} ({session.user?.email})
              </span>
              <span className="bg-indigo-100 text-indigo-800 text-xs font-medium px-2.5 py-0.5 rounded">
                {session.user?.role === 'admin' ? 'מנהל' :
                 session.user?.role === 'coordinator' ? 'רכזת שכבה' :
                 session.user?.role === 'group_coordinator' ? 'רכזת הקבצות' :
                 session.user?.role === 'teacher' ? 'מורה' : 'משתמש'}
              </span>
              <button
                onClick={() => signOut()}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                התנתק
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8 space-x-reverse">
            <Link
              href="/"
              className="border-indigo-500 text-gray-900 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
            >
              דשבורד
            </Link>
            <Link
              href="/unified-calendar"
              className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
            >
              לוח שנה
            </Link>
            <Link
              href="/room-request"
              className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
            >
              בקשת חדר
            </Link>
            <Link
              href="/rooms"
              className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
            >
              חדרים
            </Link>
            {session.user?.role === 'admin' && (
              <Link
                href="/room-priorities"
                className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
              >
                העדפות שיבוץ
              </Link>
            )}
            <Link
              href="/homerooms"
              className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
            >
              כיתות אם
            </Link>
            <Link
              href="/auditorium"
              className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
            >
              אולם
            </Link>
            <Link
              href="/study-groups"
              className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
            >
              הקבצות
            </Link>
            <Link
              href="/reports"
              className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
            >
              דוחות
            </Link>
            <Link
              href="/academic-years"
              className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
            >
              שנות לימוד
            </Link>
            <Link
              href="/year-start-reminders"
              className="border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium"
            >
              תזכורות פתיחת שנה
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* Welcome Section */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              ברוך הבא, {session.user?.name}!
            </h2>
            <p className="text-gray-600">
              {session.user?.role === 'admin' ? 'כאן תוכל לנהל את כל מערכת השיבוץ והמשתמשים' :
               session.user?.role === 'coordinator' ? 'כאן תוכלי לנהל את השיבוצים בשכבה שלך' :
               session.user?.role === 'group_coordinator' ? 'כאן תוכלי לנהל את כל ההקבצות במערכת' :
               'כאן תוכל לצפות בלוח הזמנים שלך ולבקש חדרים'}
            </p>
          </div>

          {/* Role-based Content */}
          {session.user?.role === 'admin' && (
            <>
              <div className="mb-8 overflow-hidden rounded-2xl bg-gradient-to-l from-amber-50 via-white to-sky-50 shadow-sm ring-1 ring-amber-200">
                <div className="flex flex-col gap-4 px-6 py-5 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">תזכורות לפתיחת שנה</h3>
                    <p className="mt-1 text-sm text-gray-600">
                      ריכזנו עבורך את המשימות שצריך לעדכן בתחילת השנה במקום אחד.
                    </p>
                  </div>
                  <Link
                    href="/year-start-reminders"
                    className="inline-flex items-center justify-center rounded-xl bg-amber-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600"
                  >
                    לפתיחת רשימת התזכורות
                  </Link>
                </div>
              </div>
{/* 
              Admin Stats Grid
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="p-5">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 bg-indigo-500 rounded-md flex items-center justify-center">
                          <span className="text-white font-semibold">👥</span>
                        </div>
                      </div>
                      <div className="mr-4 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">
                            משתמשים פעילים
                          </dt>
                          <dd className="text-lg font-medium text-gray-900">24</dd>
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
                          <span className="text-white font-semibold">✅</span>
                        </div>
                      </div>
                      <div className="mr-4 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">
                            קונפליקטים היום
                          </dt>
                          <dd className="text-lg font-medium text-gray-900">0</dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="p-5">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 bg-yellow-500 rounded-md flex items-center justify-center">
                          <span className="text-white font-semibold">⏰</span>
                        </div>
                      </div>
                      <div className="mr-4 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">
                            בקשות ממתינות
                          </dt>
                          <dd className="text-lg font-medium text-gray-900">12</dd>
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
                          <span className="text-white font-semibold">📈</span>
                        </div>
                      </div>
                      <div className="mr-4 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">
                            ניצולת חדרים
                          </dt>
                          <dd className="text-lg font-medium text-gray-900">78%</dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>
              </div> */}

              {/* Admin Quick Actions */}
              <div className="bg-white shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                    פעולות מנהל
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <button 
                      onClick={() => handleQuickAction('manual-assignment')}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-3 rounded-md text-sm font-medium transition-colors"
                    >
                      שיבוץ ידני
                    </button>
                    {/* <button 
                      onClick={() => handleQuickAction('override-rules')}
                      className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-3 rounded-md text-sm font-medium transition-colors"
                    >
                      דריסת חוקים
                    </button>
                    <button 
                      onClick={() => router.push('/users')}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-md text-sm font-medium transition-colors"
                    >
                      ניהול משתמשים
                    </button>
                    <button 
                      onClick={() => handleQuickAction('create-reports')}
                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-md text-sm font-medium transition-colors"
                    >
                      יצירת דוחות
                    </button> */}
                  </div>
                </div>
              </div>
            </>
          )}

          {session.user?.role === 'coordinator' && (
            <>
              {/* Coordinator Stats */}
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
                            כיתות אם בשכבה
                          </dt>
                          <dd className="text-lg font-medium text-gray-900">6</dd>
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
                          <span className="text-white font-semibold">👨‍🏫</span>
                        </div>
                      </div>
                      <div className="mr-4 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">
                            הקבצות פעילות
                          </dt>
                          <dd className="text-lg font-medium text-gray-900">8</dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="p-5">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 bg-red-500 rounded-md flex items-center justify-center">
                          <span className="text-white font-semibold">⚠️</span>
                        </div>
                      </div>
                      <div className="mr-4 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">
                            קונפליקטים בשכבה
                          </dt>
                          <dd className="text-lg font-medium text-gray-900">2</dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Coordinator Actions */}
              <div className="bg-white shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                    פעולות רכזת שכבה
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-md text-sm font-medium transition-colors">
                      ניהול כיתות אם
                    </button>
                    <button className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-3 rounded-md text-sm font-medium transition-colors">
                      שיבוץ הקבצות
                    </button>
                    <button className="bg-red-600 hover:bg-red-700 text-white px-4 py-3 rounded-md text-sm font-medium transition-colors">
                      פתרון קונפליקטים
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {session.user?.role === 'group_coordinator' && (
            <>
              {/* Group Coordinator Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="p-5">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 bg-purple-500 rounded-md flex items-center justify-center">
                          <span className="text-white font-semibold">📚</span>
                        </div>
                      </div>
                      <div className="mr-4 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">
                            כל ההקבצות
                          </dt>
                          <dd className="text-lg font-medium text-gray-900">24</dd>
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
                          <span className="text-white font-semibold">🤖</span>
                        </div>
                      </div>
                      <div className="mr-4 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">
                            שיבוצים אוטומטיים
                          </dt>
                          <dd className="text-lg font-medium text-gray-900">18</dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="p-5">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 bg-yellow-500 rounded-md flex items-center justify-center">
                          <span className="text-white font-semibold">📢</span>
                        </div>
                      </div>
                      <div className="mr-4 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">
                            התראות היום
                          </dt>
                          <dd className="text-lg font-medium text-gray-900">5</dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Group Coordinator Actions */}
              <div className="bg-white shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                    פעולות רכזת הקבצות
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <button className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-3 rounded-md text-sm font-medium transition-colors">
                      ניהול הקבצות
                    </button>
                    <button className="bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-md text-sm font-medium transition-colors">
                      שיבוץ אוטומטי
                    </button>
                    <button className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-3 rounded-md text-sm font-medium transition-colors">
                      צפייה בהתראות
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {session.user?.role === 'teacher' && (
            <>
              {/* Teacher Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="p-5">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 bg-teal-500 rounded-md flex items-center justify-center">
                          <span className="text-white font-semibold">📅</span>
                        </div>
                      </div>
                      <div className="mr-4 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">
                            שיעורים היום
                          </dt>
                          <dd className="text-lg font-medium text-gray-900">5</dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="p-5">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 bg-indigo-500 rounded-md flex items-center justify-center">
                          <span className="text-white font-semibold">🏠</span>
                        </div>
                      </div>
                      <div className="mr-4 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">
                            חדרים מוקצים
                          </dt>
                          <dd className="text-lg font-medium text-gray-900">3</dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white overflow-hidden shadow rounded-lg">
                  <div className="p-5">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 bg-pink-500 rounded-md flex items-center justify-center">
                          <span className="text-white font-semibold">📝</span>
                        </div>
                      </div>
                      <div className="mr-4 w-0 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 truncate">
                            בקשות ממתינות
                          </dt>
                          <dd className="text-lg font-medium text-gray-900">1</dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Teacher Actions */}
              <div className="bg-white shadow rounded-lg">
                <div className="px-4 py-5 sm:p-6">
                  <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                    פעולות מורה
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <button 
                      onClick={() => router.push('/unified-calendar')}
                      className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-3 rounded-md text-sm font-medium transition-colors"
                    >
                      לוח זמנים אישי
                    </button>
                    <button 
                      onClick={() => router.push('/room-request')}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-3 rounded-md text-sm font-medium transition-colors"
                    >
                      בקשת חדר
                    </button>
                    <button className="bg-pink-600 hover:bg-pink-700 text-white px-4 py-3 rounded-md text-sm font-medium transition-colors">
                      צפייה בהתראות
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
