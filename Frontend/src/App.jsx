import { Navigate, Route, Routes } from 'react-router-dom';
import { appRoutes } from './routes/appRoutes.jsx';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/passenger" replace />} />
      {appRoutes.map(({ path, element }) => (
        <Route key={path} path={path} element={element} />
      ))}
      <Route path="*" element={<Navigate to="/passenger" replace />} />
    </Routes>
  );
}

export default App;
