import { useDocumentTitle } from "../hooks/useDocumentTitle";
import Button from "../components/ui/Button";
import styles from "./NotFoundPage.module.css";

export default function NotFoundPage() {
  useDocumentTitle("Page Not Found");
  return (
    <div className={styles.page}>
      <p className={styles.code}>404</p>
      <h1>Page Not Found</h1>
      <p className={styles.text}>The page you&rsquo;re looking for doesn&rsquo;t exist or may have moved.</p>
      <Button to="/" variant="primary" size="lg">
        Back to Home
      </Button>
    </div>
  );
}
