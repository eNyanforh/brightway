import options from "../../../../shared/profile-interests.json";
import ProfileChoicePicker from "./ProfileChoicePicker";

export default function InterestPicker(props) {
  return <ProfileChoicePicker {...props} options={options} plural="interests" />;
}