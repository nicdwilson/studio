import { useI18n } from '@wordpress/react-i18n';
import { useEffect, useState } from 'react';
import { getIpcApi } from 'src/lib/get-ipc-api';

interface MySQLCheckboxProps {
	checked: boolean;
	onChange: (checked: boolean) => void;
	disabled?: boolean;
}

export function MySQLCheckbox({ checked, onChange, disabled = false }: MySQLCheckboxProps) {
	const { __ } = useI18n();
	const [ hasCredentials, setHasCredentials ] = useState<boolean | null>(null);

	useEffect(() => {
		const checkCredentials = async () => {
			try {
				const credentials = await getIpcApi().getMySQLCredentials();
				setHasCredentials(!!credentials);
			} catch (error) {
				console.error('Error checking MySQL credentials:', error);
				setHasCredentials(false);
			}
		};

		checkCredentials();
	}, []);

	const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const newValue = event.target.checked;
		
		if (newValue && !hasCredentials) {
			// Show notification that credentials need to be configured
			getIpcApi().showNotification({
				title: __('MySQL Configuration Required'),
				body: __('Please configure MySQL credentials in the MySQL tab before creating a MySQL site.'),
			});
			return;
		}
		
		onChange(newValue);
	};

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-2">
				<input
					type="checkbox"
					id="use-mysql"
					checked={checked}
					onChange={handleChange}
					disabled={disabled}
				/>
				<label htmlFor="use-mysql" className="font-semibold">
					{ __('Use MySQL database') }
				</label>
			</div>
			
			{checked && (
				<div className="text-a8c-gray-50 text-xs ml-6">
					{hasCredentials ? (
						<span className="text-green-600">
							{ __('✓ MySQL credentials configured') }
						</span>
					) : (
						<span className="text-orange-600">
							{ __('⚠ Configure MySQL credentials in the MySQL tab') }
						</span>
					)}
				</div>
			)}
			
			{!checked && (
				<div className="text-a8c-gray-50 text-xs ml-6">
					{ __('Uses SQLite database (default)') }
				</div>
			)}
		</div>
	);
} 