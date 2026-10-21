import options from "../../../../shared/profile-skills.json";
import ProfileChoicePicker from "./ProfileChoicePicker";

export default function SkillPicker(props) {
  return <ProfileChoicePicker {...props} options={options} plural="skills" />;
}
